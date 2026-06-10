"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";

type Position = {
  id: string;
  strategyId: string;
  botName: string;
  symbol: string;
  market: string;
  side: "long" | "short";
  entryPrice: number;
  entryTs: string;
  size: number;
  stopPrice: number;
  targetPrice: number;
  atr: number;
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
  avgWinUsd: number | null;
  avgLossUsd: number | null;
  expectancy: number | null;
};

type ApiResponse = { stats: Stats; open: Position[]; closed: Position[] };

/** Adaptive precision: $43,250 · $6.48 · $0.1560 · $0.00000279 */
const fmtPrice = (n: number) => {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  if (n <= 0) return "0";
  const decimals = Math.min(10, Math.ceil(-Math.log10(n)) + 3);
  return n.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
};

const fmtUsd = (n: number) =>
  `${n < 0 ? "−" : "+"}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function timeAgo(ts: string): string {
  const h = (Date.now() - new Date(ts).getTime()) / 3.6e6;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Visual price band: stop ── entry ── target with a live price dot. */
function RiskBar({ p }: { p: Position }) {
  // Normalize so stop is always left edge, target right edge
  const lo = Math.min(p.stopPrice, p.targetPrice);
  const hi = Math.max(p.stopPrice, p.targetPrice);
  const range = hi - lo;
  if (range <= 0) return null;
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - lo) / range) * 100));
  const stopAtLeft = p.stopPrice < p.targetPrice;

  return (
    <div>
      <div className="relative h-2 w-full rounded bg-surface-2">
        <div className={`absolute inset-y-0 w-[30%] ${stopAtLeft ? "left-0 rounded-l bg-danger/25" : "right-0 rounded-r bg-danger/25"}`} />
        <div className={`absolute inset-y-0 w-[30%] ${stopAtLeft ? "right-0 rounded-r bg-green/25" : "left-0 rounded-l bg-green/25"}`} />
        <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-fg/70" style={{ left: `${pct(p.entryPrice)}%` }} />
        {p.currentPrice != null && (
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-cyan"
            style={{ left: `${pct(p.currentPrice)}%` }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-fg-mute tabular">
        {stopAtLeft ? (
          <span className="text-danger/70">SL {fmtPrice(p.stopPrice)}</span>
        ) : (
          <span className="text-green/70">TP {fmtPrice(p.targetPrice)}</span>
        )}
        <span>entry {fmtPrice(p.entryPrice)}</span>
        {stopAtLeft ? (
          <span className="text-green/70">TP {fmtPrice(p.targetPrice)}</span>
        ) : (
          <span className="text-danger/70">SL {fmtPrice(p.stopPrice)}</span>
        )}
      </div>
    </div>
  );
}

const REASON_LABEL: Record<string, { text: string; cls: string }> = {
  stop:   { text: "STOP HIT",   cls: "border-danger/40 bg-danger/10 text-danger" },
  target: { text: "TARGET HIT", cls: "border-green/40 bg-green/10 text-green" },
  signal: { text: "FLIP",       cls: "border-cyan/40 bg-cyan/10 text-cyan" },
  time:   { text: "TIME OUT",   cls: "border-amber/40 bg-amber/10 text-amber" },
  manual: { text: "MANUAL",     cls: "border-border-2 bg-surface text-fg-dim" },
};

export default function PositionsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/positions")
        .then((r) => r.json() as Promise<ApiResponse>)
        .then((d) => { setData(d); setUpdatedAt(new Date()); setLoading(false); })
        .catch(() => setLoading(false));
    load();
    const id = setInterval(load, 30_000); // live refresh every 30s
    return () => clearInterval(id);
  }, []);

  const s = data?.stats;
  const openSorted = data ? [...data.open].sort((a, b) => (b.livePnlUsd ?? -1e9) - (a.livePnlUsd ?? -1e9)) : [];
  const liveTotal = openSorted.reduce((sum, p) => sum + (p.livePnlUsd ?? 0), 0);

  return (
    <main className="hud-scanlines relative min-h-screen bg-bg">
      <div className="hud-grid absolute inset-0 opacity-40" />
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-8">

        <div className="mb-8"><SiteNav active="/positions" /></div>

        <div className="mb-6 border-b border-border pb-4">
          <h1 className="font-serif text-4xl text-fg" style={{ fontFamily: "var(--font-serif)" }}>
            Live Positions
          </h1>
          <p className="mt-1 text-sm text-fg-dim">
            Every open trade, marked to the latest price · stops at 2×ATR, targets at 4×ATR
          </p>
          {updatedAt && (
            <p className="mt-1 flex items-center gap-1.5 text-[10px] tracking-widest text-green">
              <span className="blink inline-block h-1.5 w-1.5 rounded-full bg-green" />
              LIVE · auto-refresh 30s · updated {updatedAt.toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* portfolio stats */}
        {s && (
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "OPEN TRADES", value: String(s.openCount), tone: "text-cyan" },
              { label: "LIVE P&L (OPEN)", value: fmtUsd(liveTotal), tone: liveTotal >= 0 ? "text-green" : "text-danger" },
              { label: "REALIZED P&L", value: fmtUsd(s.totalPnlUsd), tone: s.totalPnlUsd >= 0 ? "text-green" : "text-danger" },
              { label: "CLOSED TRADES", value: String(s.closedCount), tone: "text-fg" },
              { label: "WIN RATE", value: s.winRate !== null ? `${(s.winRate * 100).toFixed(0)}%` : "—", tone: s.winRate !== null && s.winRate >= 0.5 ? "text-green" : "text-fg" },
              { label: "EXPECTANCY / TRADE", value: s.expectancy !== null ? fmtUsd(s.expectancy) : "—", tone: s.expectancy !== null && s.expectancy >= 0 ? "text-green" : "text-danger" },
            ].map((c) => (
              <div key={c.label} className="border border-border bg-surface/30 px-4 py-3">
                <div className="text-[10px] tracking-widest text-fg-mute">{c.label}</div>
                <div className={`mt-1 text-xl tabular ${c.tone}`}>{c.value}</div>
              </div>
            ))}
          </div>
        )}

        {loading && <div className="py-20 text-center text-sm text-fg-dim">Loading positions…</div>}

        {/* open positions — card per trade for readability */}
        {data && openSorted.length > 0 && (
          <div className="mb-10">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-[11px] tracking-widest text-fg-mute">OPEN POSITIONS ({openSorted.length})</span>
              <span className="text-[10px] text-fg-mute">sorted by live P&L · cyan dot = current price</span>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {openSorted.map((p) => {
                const pnl = p.livePnlUsd;
                return (
                  <Link
                    key={p.id}
                    href={`/strategy/${p.strategyId}`}
                    className="group border border-border bg-surface/20 p-4 transition-colors hover:border-border-2 hover:bg-surface/40"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`border px-2 py-0.5 text-[10px] tracking-wider ${p.side === "long" ? "border-green/40 bg-green/10 text-green" : "border-danger/40 bg-danger/10 text-danger"}`}>
                          {p.side === "long" ? "▲ LONG" : "▼ SHORT"}
                        </span>
                        <span className="text-sm text-fg group-hover:text-cyan transition-colors">{p.symbol}</span>
                        <span className="text-[11px] text-fg-dim">{p.botName}</span>
                      </div>
                      <div className="text-right">
                        {pnl != null ? (
                          <>
                            <div className={`text-base tabular ${pnl >= 0 ? "text-green" : "text-danger"}`}>{fmtUsd(pnl)}</div>
                            <div className={`text-[10px] tabular ${pnl >= 0 ? "text-green/70" : "text-danger/70"}`}>
                              {(p.livePnlPct ?? 0) >= 0 ? "+" : ""}{p.livePnlPct}%
                            </div>
                          </>
                        ) : (
                          <span className="text-fg-mute">—</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3"><RiskBar p={p} /></div>

                    <div className="mt-3 flex items-center justify-between text-[10px] text-fg-mute tabular">
                      <span>size ${p.size.toLocaleString()}</span>
                      <span>now {p.currentPrice != null ? fmtPrice(p.currentPrice) : "—"}</span>
                      <span>opened {timeAgo(p.entryTs)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {data && data.open.length === 0 && !loading && (
          <div className="mb-8 border border-border bg-surface/20 px-6 py-8 text-center text-sm text-fg-dim">
            No open positions. The bots run every 15 minutes — new trades appear here automatically.
          </div>
        )}

        {/* closed positions */}
        {data && data.closed.length > 0 && (
          <div>
            <div className="mb-3 text-[11px] tracking-widest text-fg-mute">
              CLOSED TRADES (last {data.closed.length})
            </div>
            <div className="divide-y divide-border/60 border border-border bg-surface/20">
              <div className="hidden grid-cols-[140px_90px_70px_90px_90px_90px_90px_1fr] gap-3 border-b border-border px-4 py-2 text-[10px] tracking-widest text-fg-mute sm:grid">
                <span>AGENT</span>
                <span>SYMBOL</span>
                <span>SIDE</span>
                <span className="text-right">ENTRY</span>
                <span className="text-right">EXIT</span>
                <span className="text-right">P&L $</span>
                <span className="text-right">P&L %</span>
                <span className="text-right">CLOSED BECAUSE</span>
              </div>
              {[...data.closed].reverse().map((p) => {
                const reason = REASON_LABEL[p.closeReason ?? ""] ?? { text: "—", cls: "text-fg-dim" };
                return (
                  <Link key={p.id} href={`/strategy/${p.strategyId}`}
                    className="grid grid-cols-2 gap-2 px-4 py-2.5 text-[12px] transition-colors hover:bg-surface/50 sm:grid-cols-[140px_90px_70px_90px_90px_90px_90px_1fr] sm:items-center sm:gap-3">
                    <span className="truncate text-fg">{p.botName} <span className="text-[10px] text-fg-mute">{p.strategyId}</span></span>
                    <span className="text-fg-dim">{p.symbol}</span>
                    <span className={p.side === "long" ? "text-green" : "text-danger"}>{p.side.toUpperCase()}</span>
                    <span className="text-right text-fg-dim tabular">{fmtPrice(p.entryPrice)}</span>
                    <span className="text-right text-fg-dim tabular">{p.exitPrice != null ? fmtPrice(p.exitPrice) : "—"}</span>
                    <span className="text-right tabular">
                      {p.pnlUsd != null ? (
                        <span className={p.pnlUsd >= 0 ? "text-green" : "text-danger"}>{fmtUsd(p.pnlUsd)}</span>
                      ) : "—"}
                    </span>
                    <span className="text-right tabular">
                      {p.pnlPct != null ? (
                        <span className={p.pnlPct >= 0 ? "text-green/80" : "text-danger/80"}>
                          {p.pnlPct >= 0 ? "+" : ""}{p.pnlPct.toFixed(2)}%
                        </span>
                      ) : "—"}
                    </span>
                    <span className="text-right">
                      <span className={`inline-block border px-1.5 py-0.5 text-[9px] tracking-wider ${reason.cls}`}>
                        {reason.text}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
            <p className="mt-3 text-[10px] text-fg-mute">
              FLIP = opposite signal arrived · STOP HIT = 2×ATR loss limit · TARGET HIT = 4×ATR profit target · TIME OUT = 30-day max hold
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
