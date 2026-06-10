"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

type Status = "LIVE" | "INCUB" | "BACKTEST";

type Row = {
  id: string;
  name: string;
  market: string;
  archetype: string;
  since: string;
  ret: number | null;
  sharpe: number | null;
  dd: number;
  status: Status;
  spark: number[];
};

type ApiResponse = {
  chain: { ok: boolean; brokenAt: number | null };
  strategies: {
    spec: {
      id: string;
      name: string;
      market: string;
      archetype: string;
    };
    liveDays: number;
    totalReturnPct: number | null;
    sharpe: number | null;
    maxDrawdownPct: number;
    forwardCurve: number[];
    status: Status;
  }[];
};

function Spark({ data, color }: { data: number[]; color: string }) {
  const w = 92;
  const h = 24;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / (max - min || 1)) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.25" />
    </svg>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  LIVE: "text-green border-green/40",
  INCUB: "text-amber border-amber/40",
  BACKTEST: "text-fg-dim border-border-2",
};

const ARCHETYPE_LABEL: Record<string, string> = {
  systematic: "SYS",
  "multi-agent": "AGENT",
  fundamental: "FUND",
};

export default function ScoreboardTeaser() {
  const [rows, setRows] = useState<Row[]>([]);
  const [chainOk, setChainOk] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/scoreboard")
      .then((r) => r.json() as Promise<ApiResponse>)
      .then((d) => {
        if (!alive) return;
        setChainOk(d.chain.ok);
        setRows(
          d.strategies.map((s) => ({
            id: s.spec.id,
            name: s.spec.name,
            market: s.spec.market,
            archetype: s.spec.archetype,
            since: s.status === "BACKTEST" ? "—" : `${s.liveDays}d`,
            ret: s.totalReturnPct,
            sharpe: s.sharpe,
            dd: s.maxDrawdownPct,
            status: s.status,
            spark: s.forwardCurve,
          })),
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section id="scoreboard" className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-28">
      <div className="mb-4 flex items-end justify-between border-b border-border pb-3">
        <h2 className="text-[11px] tracking-[0.3em] text-fg-dim">
          STRATEGY SCOREBOARD
        </h2>
        <span className="flex items-center gap-2 text-[10px] tracking-widest text-fg-mute">
          {chainOk !== null && (
            <span
              className={`flex items-center gap-1.5 ${chainOk ? "text-green" : "text-danger"}`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${chainOk ? "bg-green" : "bg-danger"}`}
              />
              {chainOk ? "CHAIN VERIFIED" : "CHAIN TAMPERED"}
            </span>
          )}
          <span>· SORTED BY LIVE-VERIFIED</span>
        </span>
      </div>

      {/* header row */}
      <div className="grid grid-cols-[88px_1fr_84px_64px_72px_64px_104px] gap-3 px-3 pb-2 text-[10px] tracking-widest text-fg-mute">
        <span>ID</span>
        <span>STRATEGY</span>
        <span>MARKET</span>
        <span className="text-right">LIVE</span>
        <span className="text-right">RETURN</span>
        <span className="text-right">MAX DD</span>
        <span className="text-right">FORWARD</span>
      </div>

      <div className="divide-y divide-border/70">
        {rows.map((r, i) => {
          const color =
            r.status === "LIVE"
              ? "#22c55e"
              : r.status === "INCUB"
                ? "#f59e0b"
                : "#64748b";
          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.06, ease: "easeOut" }}
            >
            <Link
              href={`/strategy/${r.id}`}
              className="group grid grid-cols-[88px_1fr_84px_64px_72px_64px_104px] items-center gap-3 px-3 py-3 text-[13px] transition-colors hover:bg-surface/60"
            >
              <span className="text-fg-dim tabular">{r.id}</span>
              <span className="flex items-center gap-2 text-fg">
                <span
                  className={`rounded-sm border px-1.5 py-0.5 text-[9px] tracking-wider ${STATUS_STYLE[r.status]}`}
                >
                  {r.status}
                </span>
                {r.name}
                <span className="text-[9px] tracking-wider text-fg-mute">
                  {ARCHETYPE_LABEL[r.archetype] ?? r.archetype}
                </span>
              </span>
              <span className="text-cyan/80">{r.market}</span>
              <span className="text-right text-fg-dim tabular">{r.since}</span>
              <span className="text-right tabular">
                {r.ret === null ? (
                  <span className="text-fg-mute">—</span>
                ) : (
                  <span className={r.ret >= 0 ? "text-green" : "text-danger"}>
                    {r.ret >= 0 ? "+" : ""}
                    {r.ret}%
                  </span>
                )}
              </span>
              <span className="text-right text-danger/90 tabular">
                {r.dd.toFixed(1)}%
              </span>
              <span className="flex justify-end">
                <Spark data={r.spark} color={color} />
              </span>
            </Link>
            </motion.div>
          );
        })}
      </div>

      <p className="mt-5 max-w-xl text-[11px] leading-relaxed text-fg-dim">
        Every strategy is hash-committed before its first signal. The track
        record you see is <span className="text-fg">forward-only</span> — no
        backtest cherry-picking, no editable history. Even famous open frameworks
        must prove themselves here, live.
      </p>
    </section>
  );
}
