"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";

type Position = {
  id: string;
  strategyId: string;
  botName: string;
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  entryTs: string;
  size: number;
  stopPrice: number;
  targetPrice: number;
  status: "open" | "closed";
  exitPrice?: number;
  exitTs?: string;
  closeReason?: string;
  pnlPct?: number;
  pnlUsd?: number;
  currentPrice?: number | null;
  livePnlPct?: number | null;
  livePnlUsd?: number | null;
};

type Stats = {
  openCount: number;
  closedCount: number;
  totalPnlUsd: number;
  winRate: number | null;
};

type ApiResponse = { stats: Stats; open: Position[]; closed: Position[] };

// ── formatting ─────────────────────────────────────────────────────────────
const fmtPrice = (n: number) => {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  if (n <= 0) return "0";
  const decimals = Math.min(10, Math.ceil(-Math.log10(n)) + 3);
  return n.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
};

const fmtUsd = (n: number) =>
  `${n < 0 ? "−" : "+"}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const fmtWhen = (ts: string) =>
  new Date(ts).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function ago(ts: string): string {
  const h = (Date.now() - new Date(ts).getTime()) / 3.6e6;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} dk`;
  if (h < 48) return `${Math.round(h)} sa`;
  return `${Math.round(h / 24)} gün`;
}

function held(a: string, b?: string): string {
  if (!b) return "—";
  const h = (new Date(b).getTime() - new Date(a).getTime()) / 3.6e6;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} dk`;
  if (h < 48) return `${Math.round(h)} sa`;
  return `${Math.round(h / 24)} gün`;
}

// ── small pieces ───────────────────────────────────────────────────────────
function SideBadge({ side }: { side: "long" | "short" }) {
  return side === "long" ? (
    <span className="inline-flex w-16 justify-center border border-green/40 bg-green/10 py-0.5 text-[10px] tracking-wider text-green">▲ LONG</span>
  ) : (
    <span className="inline-flex w-16 justify-center border border-danger/40 bg-danger/10 py-0.5 text-[10px] tracking-wider text-danger">▼ SHORT</span>
  );
}

function Pnl({ usd, pct, big = false }: { usd: number | null | undefined; pct: number | null | undefined; big?: boolean }) {
  if (usd == null) return <span className="text-fg-mute">—</span>;
  const cls = usd >= 0 ? "text-green" : "text-danger";
  return (
    <span className={`${cls} tabular ${big ? "text-base" : ""}`}>
      {fmtUsd(usd)}
      {pct != null && <span className="ml-1 text-[10px] opacity-60">{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>}
    </span>
  );
}

const OUTCOME: Record<string, { text: string; cls: string }> = {
  target: { text: "HEDEF TUTTU", cls: "border-green/40 bg-green/10 text-green" },
  stop:   { text: "STOP OLDU",   cls: "border-danger/40 bg-danger/10 text-danger" },
  signal: { text: "SİNYAL DÖNDÜ", cls: "border-cyan/40 bg-cyan/10 text-cyan" },
  time:   { text: "SÜRE DOLDU",  cls: "border-amber/40 bg-amber/10 text-amber" },
  manual: { text: "MANUEL",      cls: "border-border-2 text-fg-dim" },
};

// ── page ───────────────────────────────────────────────────────────────────
export default function PositionsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      fetch("/api/positions")
        .then((r) => r.json() as Promise<ApiResponse>)
        .then((d) => { setData(d); setLoading(false); })
        .catch(() => setLoading(false));
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const open = data ? [...data.open].sort((a, b) => (b.livePnlUsd ?? -1e9) - (a.livePnlUsd ?? -1e9)) : [];
  const liveTotal = open.reduce((s, p) => s + (p.livePnlUsd ?? 0), 0);

  return (
    <main className="relative min-h-screen bg-bg">
      <div className="relative z-10 mx-auto max-w-5xl px-6 py-8">
        <div className="mb-10"><SiteNav active="/positions" /></div>

        {/* ── summary: only the 3 numbers that matter ── */}
        <div className="mb-10 grid grid-cols-3 gap-4">
          <div>
            <div className="text-[11px] tracking-widest text-fg-mute">AÇIK POZİSYON</div>
            <div className="mt-1 text-3xl text-fg tabular">{data?.stats.openCount ?? "—"}</div>
          </div>
          <div>
            <div className="text-[11px] tracking-widest text-fg-mute">AÇIK K/Z (CANLI)</div>
            <div className={`mt-1 text-3xl tabular ${liveTotal >= 0 ? "text-green" : "text-danger"}`}>
              {data ? fmtUsd(liveTotal) : "—"}
            </div>
          </div>
          <div>
            <div className="text-[11px] tracking-widest text-fg-mute">GERÇEKLEŞEN K/Z</div>
            <div className={`mt-1 text-3xl tabular ${(data?.stats.totalPnlUsd ?? 0) >= 0 ? "text-green" : "text-danger"}`}>
              {data ? fmtUsd(data.stats.totalPnlUsd) : "—"}
            </div>
          </div>
        </div>

        {loading && <div className="py-20 text-center text-sm text-fg-dim">Yükleniyor…</div>}

        {/* ── open positions ── */}
        {data && (
          <section className="mb-12">
            <h2 className="mb-1 font-serif text-2xl text-fg" style={{ fontFamily: "var(--font-serif)" }}>
              Açık Pozisyonlar
            </h2>
            <p className="mb-4 text-[11px] text-fg-dim">
              30 saniyede bir yenilenir · stop = giriş − 2×ATR · hedef = giriş + 4×ATR
            </p>

            {open.length === 0 ? (
              <div className="border border-border bg-surface/20 px-6 py-10 text-center text-sm text-fg-dim">
                Şu an açık pozisyon yok — botlar saatte bir tarıyor, yenisi açıldığında burada görünür.
              </div>
            ) : (
              <div className="divide-y divide-border/60 border border-border">
                {open.map((p) => (
                  <Link key={p.id} href={`/strategy/${p.strategyId}`}
                    className="block px-5 py-4 transition-colors hover:bg-surface/40">
                    {/* line 1: what + how much */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <SideBadge side={p.side} />
                        <span className="text-[15px] text-fg">{p.symbol}</span>
                        <span className="text-[11px] text-fg-mute">{p.botName}</span>
                      </div>
                      <Pnl usd={p.livePnlUsd} pct={p.livePnlPct} big />
                    </div>
                    {/* line 2: the whole story in one calm row */}
                    <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] tabular sm:grid-cols-5">
                      <span className="text-fg-mute">giriş <span className="text-fg-dim">{fmtPrice(p.entryPrice)}</span></span>
                      <span className="text-fg-mute">şimdi <span className="text-fg">{p.currentPrice != null ? fmtPrice(p.currentPrice) : "—"}</span></span>
                      <span className="text-danger/70">stop {fmtPrice(p.stopPrice)}</span>
                      <span className="text-green/70">hedef {fmtPrice(p.targetPrice)}</span>
                      <span className="text-fg-mute">{fmtWhen(p.entryTs)} · {ago(p.entryTs)} önce</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── trade history ── */}
        {data && data.closed.length > 0 && (
          <section>
            <h2 className="mb-1 font-serif text-2xl text-fg" style={{ fontFamily: "var(--font-serif)" }}>
              Geçmiş İşlemler
            </h2>
            <p className="mb-4 text-[11px] text-fg-dim">
              Son {data.closed.length} işlem · kazanma oranı{" "}
              {data.stats.winRate != null ? `${Math.round(data.stats.winRate * 100)}%` : "—"}
            </p>

            <div className="divide-y divide-border/60 border border-border">
              {[...data.closed].reverse().map((p) => {
                const o = OUTCOME[p.closeReason ?? ""] ?? { text: "—", cls: "text-fg-dim" };
                return (
                  <Link key={p.id} href={`/strategy/${p.strategyId}`}
                    className="block px-5 py-3.5 transition-colors hover:bg-surface/40">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <SideBadge side={p.side} />
                        <span className="text-[14px] text-fg">{p.symbol}</span>
                        <span className="text-[11px] text-fg-mute">{p.botName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`hidden border px-2 py-0.5 text-[9px] tracking-wider sm:inline-block ${o.cls}`}>{o.text}</span>
                        <Pnl usd={p.pnlUsd} pct={p.pnlPct} />
                      </div>
                    </div>
                    <div className="mt-1.5 text-[11px] text-fg-mute tabular">
                      {fmtPrice(p.entryPrice)} → {p.exitPrice != null ? fmtPrice(p.exitPrice) : "—"}
                      <span className="mx-2 text-border-2">|</span>
                      {fmtWhen(p.entryTs)} → {p.exitTs ? fmtWhen(p.exitTs) : "—"}
                      <span className="mx-2 text-border-2">|</span>
                      {held(p.entryTs, p.exitTs)} tutuldu
                      <span className="sm:hidden"> · {o.text}</span>
                    </div>
                  </Link>
                );
              })}
            </div>

            <p className="mt-4 text-[10px] leading-relaxed text-fg-mute">
              <span className="text-green">HEDEF TUTTU</span> = kâr al seviyesine ulaştı ·{" "}
              <span className="text-danger">STOP OLDU</span> = zarar kes çalıştı ·{" "}
              <span className="text-cyan">SİNYAL DÖNDÜ</span> = bot ters yönde sinyal verdi ·{" "}
              <span className="text-amber">SÜRE DOLDU</span> = 30 gün maks. tutma süresi
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
