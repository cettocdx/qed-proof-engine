"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import SiteNav from "@/components/SiteNav";

type Status = "LIVE" | "INCUB" | "BACKTEST";
type SortKey = "ret" | "sharpe" | "dd" | "since" | "signals" | "equity" | "pnl";

type Row = {
  id: string;
  name: string;
  handle: string;
  market: string;
  archetype: string;
  skill: string;
  riskLevel: string;
  since: number; // liveDays
  ret: number | null;
  sharpe: number | null;
  dd: number;
  signals: number;
  status: Status;
  spark: number[];
  equity: number | null;
  pnl: number | null;
};

type ApiResponse = {
  chain: { ok: boolean; brokenAt: number | null };
  strategies: {
    spec: {
      id: string;
      name: string;
      market: string;
      archetype: string;
      creator: string;
      params: Record<string, unknown>;
    };
    liveDays: number;
    totalReturnPct: number | null;
    sharpe: number | null;
    maxDrawdownPct: number;
    forwardCurve: number[];
    spark?: number[];
    signalCount: number;
    status: Status;
    winRatePct: number | null;
    exposurePct: number | null;
  }[];
};

function Spark({ data, color }: { data: number[]; color: string }) {
  const w = 80;
  const h = 28;
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
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  LIVE: "text-green border-green/40 bg-green/5",
  INCUB: "text-amber border-amber/40 bg-amber/5",
  BACKTEST: "text-fg-dim border-border-2 bg-surface/40",
};

const ARCHETYPE_COLOR: Record<string, string> = {
  systematic: "text-cyan/70",
  "multi-agent": "text-amber/80",
  fundamental: "text-green/70",
};

const MARKET_LABEL: Record<string, string> = {
  "US-EQ": "EQ",
  CRYPTO: "CRYPTO",
  POLYMARKET: "POLY",
  FX: "FX",
  FUTURES: "FUT",
};

export default function ScoreboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [chainOk, setChainOk] = useState<boolean | null>(null);
  const [sort, setSort] = useState<SortKey>("pnl");
  const [asc, setAsc] = useState(false);
  const [filterMarket, setFilterMarket] = useState("ALL");
  const [filterArchetype, setFilterArchetype] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => Promise.all([
      fetch("/api/scoreboard").then((r) => r.json() as Promise<ApiResponse>),
      fetch("/api/wallets").then((r) => r.json() as Promise<{ wallets: { strategyId: string; equity: number; realizedPnl: number; unrealizedPnl: number }[] }>).catch(() => ({ wallets: [] })),
    ])
      .then(([d, w]) => {
        const walletById = new Map(w.wallets.map((x) => [x.strategyId, x]));
        setChainOk(d.chain.ok);
        setRows(
          d.strategies.map((s) => ({
            id: s.spec.id,
            name: s.spec.name,
            handle: s.spec.creator ?? "",
            market: s.spec.market,
            archetype: s.spec.archetype,
            skill: String((s.spec.params as Record<string, unknown>)?.skill ?? ""),
            riskLevel: String(
              ((s.spec.params as Record<string, unknown>)?.profile as Record<string, unknown>)?.riskLevel ?? ""
            ),
            since: s.liveDays,
            ret: walletById.get(s.spec.id)
              ? +(((walletById.get(s.spec.id)!.equity / 100000) - 1) * 100).toFixed(2)
              : s.totalReturnPct,
            sharpe: s.sharpe,
            dd: s.maxDrawdownPct,
            signals: s.signalCount,
            status: s.status,
            spark: s.spark ?? s.forwardCurve,
            equity: walletById.get(s.spec.id)?.equity ?? null,
            pnl: walletById.get(s.spec.id)
              ? +(walletById.get(s.spec.id)!.realizedPnl + walletById.get(s.spec.id)!.unrealizedPnl).toFixed(2)
              : null,
          }))
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
    load();
    const id = setInterval(load, 60_000); // live refresh every 60s
    return () => clearInterval(id);
  }, []);

  const sortedRows = useMemo(() => {
    let filtered = rows;
    if (filterMarket !== "ALL") filtered = filtered.filter((r) => r.market === filterMarket);
    if (filterArchetype !== "ALL") filtered = filtered.filter((r) => r.archetype === filterArchetype);
    if (filterStatus !== "ALL") filtered = filtered.filter((r) => r.status === filterStatus);

    return [...filtered].sort((a, b) => {
      let va: number, vb: number;
      switch (sort) {
        case "ret":   va = a.ret ?? -999; vb = b.ret ?? -999; break;
        case "sharpe": va = a.sharpe ?? -999; vb = b.sharpe ?? -999; break;
        case "dd":    va = a.dd; vb = b.dd; break;
        case "since": va = a.since; vb = b.since; break;
        case "signals": va = a.signals; vb = b.signals; break;
        case "equity": va = a.equity ?? -999; vb = b.equity ?? -999; break;
        case "pnl": va = a.pnl ?? -999; vb = b.pnl ?? -999; break;
        default: va = 0; vb = 0;
      }
      return asc ? va - vb : vb - va;
    });
  }, [rows, sort, asc, filterMarket, filterArchetype, filterStatus]);

  function toggleSort(k: SortKey) {
    if (sort === k) setAsc(!asc);
    else { setSort(k); setAsc(false); }
  }

  const SortTh = ({ label, k }: { label: string; k: SortKey }) => (
    <button
      onClick={() => toggleSort(k)}
      className={`text-right text-[10px] tracking-widest transition-colors hover:text-fg ${sort === k ? "text-cyan" : "text-fg-mute"}`}
    >
      {label}{sort === k ? (asc ? " ↑" : " ↓") : ""}
    </button>
  );

  const markets = ["ALL", ...Array.from(new Set(rows.map((r) => r.market)))];
  const archetypes = ["ALL", ...Array.from(new Set(rows.map((r) => r.archetype)))];
  const statuses: string[] = ["ALL", "LIVE", "INCUB", "BACKTEST"];

  const liveCount = rows.filter((r) => r.status === "LIVE").length;
  const incubCount = rows.filter((r) => r.status === "INCUB").length;

  return (
    <main className="hud-scanlines relative min-h-screen bg-bg">
      <div className="hud-grid absolute inset-0 opacity-40" />
      <div className="relative z-10 mx-auto max-w-7xl px-6 py-8">

        {/* header */}
        <div className="mb-8"><SiteNav active="/scoreboard" /></div>

        {/* title + chain status */}
        <div className="mb-6 flex items-end justify-between border-b border-border pb-4">
          <div>
            <h1 className="font-serif text-4xl text-fg sm:text-5xl" style={{ fontFamily: "var(--font-serif)" }}>
              Live Scoreboard
            </h1>
            <p className="mt-2 text-sm text-fg-dim">
              {rows.length} strategies · {liveCount} LIVE · {incubCount} INCUB — forward-only, hash-committed
            </p>
          </div>
          {chainOk !== null && (
            <span className={`flex items-center gap-2 text-[11px] tracking-widest ${chainOk ? "text-green" : "text-danger"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${chainOk ? "bg-green blink" : "bg-danger"}`} />
              {chainOk ? "CHAIN VERIFIED" : "CHAIN TAMPERED"}
            </span>
          )}
        </div>

        {/* filters */}
        <div className="mb-5 flex flex-wrap items-center gap-3 text-[11px] tracking-widest">
          {[
            { label: "MARKET", values: markets, state: filterMarket, set: setFilterMarket },
            { label: "ARCHETYPE", values: archetypes, state: filterArchetype, set: setFilterArchetype },
            { label: "STATUS", values: statuses, state: filterStatus, set: setFilterStatus },
          ].map(({ label, values, state, set }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-fg-mute">{label}</span>
              <div className="flex gap-1">
                {values.map((v) => (
                  <button
                    key={v}
                    onClick={() => set(v)}
                    className={`border px-2 py-0.5 transition-colors ${
                      state === v
                        ? "border-cyan/50 text-cyan"
                        : "border-border text-fg-dim hover:border-border-2 hover:text-fg"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <span className="ml-auto text-fg-mute">{sortedRows.length} shown</span>
        </div>

        {/* table */}
        {loading ? (
          <div className="py-20 text-center text-fg-dim text-sm">Loading scoreboard…</div>
        ) : (
          <>
          {/* mobile cards */}
          <div className="space-y-2 md:hidden">
            {sortedRows.map((r) => (
              <Link
                key={r.id}
                href={`/strategy/${r.id}`}
                className="block border border-border bg-surface/20 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[9px] ${STATUS_STYLE[r.status]}`}>
                      {r.status}
                    </span>
                    <span className="truncate text-[13px] text-fg">{r.name}</span>
                  </div>
                  {r.spark.length >= 3 && (
                    <Spark data={r.spark} color={r.spark[r.spark.length - 1] >= r.spark[0] ? "#22c55e" : "#ef4444"} />
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between text-[12px] tabular">
                  <span className="text-fg">{r.equity === null ? "—" : `$${Math.round(r.equity).toLocaleString()}`}</span>
                  <span className={r.pnl === null ? "text-fg-mute" : r.pnl >= 0 ? "text-green" : "text-danger"}>
                    {r.pnl === null ? "—" : `${r.pnl >= 0 ? "+" : "−"}$${Math.abs(r.pnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  </span>
                  <span className={r.ret === null ? "text-fg-mute" : r.ret >= 0 ? "text-green" : "text-danger"}>
                    {r.ret === null ? "—" : `${r.ret >= 0 ? "+" : ""}${r.ret}%`}
                  </span>
                  <span className="text-[10px] text-fg-mute">{r.signals} sig</span>
                </div>
              </Link>
            ))}
          </div>

          {/* desktop table */}
          <div className="hidden overflow-x-auto border border-border bg-surface/20 md:block">
           <div className="min-w-[1020px]">
            {/* header row */}
            <div className="grid grid-cols-[64px_170px_56px_50px_50px_64px_96px_86px_76px_66px_66px_86px] gap-3 border-b border-border px-4 py-2 text-[10px] tracking-widest text-fg-mute">
              <span>ID</span>
              <span>STRATEGY</span>
              <span>MARKET</span>
              <span>TYPE</span>
              <span className="text-right"><SortTh label="LIVE" k="since" /></span>
              <span className="text-right"><SortTh label="SIG" k="signals" /></span>
              <span className="text-right"><SortTh label="EQUITY" k="equity" /></span>
              <span className="text-right"><SortTh label="P&L" k="pnl" /></span>
              <span className="text-right"><SortTh label="RETURN" k="ret" /></span>
              <span className="text-right" title="Max drawdown"><SortTh label="DD" k="dd" /></span>
              <span className="text-right" title="Sharpe ratio"><SortTh label="SHP" k="sharpe" /></span>
              <span className="text-right text-fg-mute">TREND</span>
            </div>

            <div className="divide-y divide-border/50">
              {sortedRows.map((r, i) => {
                const sparkColor =
                  r.status === "LIVE" ? "#22c55e" : r.status === "INCUB" ? "#f59e0b" : "#64748b";
                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.4) }}
                  >
                    <Link
                      href={`/strategy/${r.id}`}
                      className="group grid grid-cols-[64px_170px_56px_50px_50px_64px_96px_86px_76px_66px_66px_86px] items-center gap-3 px-4 py-3 text-[12px] transition-colors hover:bg-surface/60"
                    >
                      <span className="text-fg-dim tabular">{r.id}</span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[9px] ${STATUS_STYLE[r.status]}`}>
                            {r.status}
                          </span>
                          <span className="truncate text-fg group-hover:text-cyan transition-colors">{r.name}</span>
                        </div>
                        <div className="mt-0.5 truncate text-[10px] text-fg-mute">{r.handle}</div>
                      </div>

                      <span className="text-[11px] text-cyan/70">{MARKET_LABEL[r.market] ?? r.market}</span>

                      <span className={`text-[10px] tracking-wider ${ARCHETYPE_COLOR[r.archetype] ?? "text-fg-dim"}`}>
                        {r.archetype === "multi-agent" ? "DESK" : r.archetype.slice(0, 4).toUpperCase()}
                      </span>

                      <span className="text-right text-fg-dim tabular">
                        {r.since > 0 ? `${r.since}d` : "—"}
                      </span>

                      <span className="text-right text-fg-dim tabular">{r.signals}</span>

                      <span className="text-right tabular text-fg">
                        {r.equity === null ? "—" : `$${Math.round(r.equity).toLocaleString()}`}
                      </span>

                      <span className="text-right tabular">
                        {r.pnl === null ? (
                          <span className="text-fg-mute">—</span>
                        ) : (
                          <span className={r.pnl >= 0 ? "text-green" : "text-danger"}>
                            {r.pnl >= 0 ? "+" : "−"}${Math.abs(r.pnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </span>
                        )}
                      </span>

                      <span className="text-right tabular">
                        {r.ret === null ? (
                          <span className="text-fg-mute">—</span>
                        ) : (
                          <span className={r.ret >= 0 ? "text-green" : "text-danger"}>
                            {r.ret >= 0 ? "+" : ""}{r.ret}%
                          </span>
                        )}
                      </span>

                      <span className="text-right tabular">
                        {r.signals < 2 || r.dd === 0 ? <span className="text-fg-mute">—</span> : <span className="text-danger/80">{r.dd.toFixed(1)}%</span>}
                      </span>

                      <span className="text-right tabular">
                        {r.sharpe === null ? (
                          <span className="text-fg-mute">—</span>
                        ) : (
                          <span className={r.sharpe >= 1 ? "text-green" : r.sharpe >= 0 ? "text-fg" : "text-danger"}>
                            {r.sharpe.toFixed(2)}
                          </span>
                        )}
                      </span>

                      <span className="flex justify-end">
                        {r.spark.length >= 3 ? (
                          <Spark
                            data={r.spark}
                            color={
                              r.spark[r.spark.length - 1] >= r.spark[0]
                                ? "#22c55e"
                                : "#ef4444"
                            }
                          />
                        ) : (
                          <span className="text-fg-mute text-[10px]">—</span>
                        )}
                      </span>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
           </div>
          </div>
          </>
        )}

        {/* legend */}
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-fg-dim">
          <span><span className="text-green">■</span> LIVE — 7+ days on real forward data</span>
          <span><span className="text-amber">■</span> INCUB — has signals, under 7 days</span>
          <span><span className="text-fg-dim">■</span> BACKTEST — committed, no signals yet</span>
          <span className="ml-auto text-fg-mute">Click any row for full dossier + chain proof</span>
        </div>
      </div>
    </main>
  );
}
