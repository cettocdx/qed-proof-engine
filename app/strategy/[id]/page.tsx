import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import UnlockBox from "@/components/UnlockBox";
import { hasAccess } from "@/lib/subscribers/access";
import Avatar from "@/components/Avatar";
import EquityChart from "@/components/EquityChart";
import { getStrategyDetail } from "@/lib/ledger/ledger";
import { getWallet } from "@/lib/portfolio/wallet";
import { getEquityCurve } from "@/lib/portfolio/snapshots";
import { botById } from "@/lib/bots/roster";
import type { StrategyDetail, SignalRecord } from "@/lib/ledger/schema";

type SpecProfile = {
  tagline: string;
  specialty: string;
  riskLevel: "low" | "medium" | "high";
  avatarSeed: string;
};
const RISK_COLOR = { low: "text-green", medium: "text-amber", high: "text-danger" } as const;

// Always read the live ledger; a track record is never cached.
export const dynamic = "force-dynamic";

const STATUS_STYLE = {
  LIVE: "text-green border-green/40",
  INCUB: "text-amber border-amber/40",
  BACKTEST: "text-fg-dim border-border-2",
} as const;

const ACTION_COLOR: Record<string, string> = {
  BUY: "text-green",
  COVER: "text-green",
  SELL: "text-danger",
  SHORT: "text-danger",
  FLAT: "text-fg-dim",
};

interface ClosedTrade {
  symbol: string;
  direction: "LONG" | "SHORT";
  entryTs: string;
  exitTs: string | null;
  entryPrice: number;
  exitPrice: number | null;
  notional: number;
  pnlUsd: number | null;
  pnlPct: number | null;
  status: "WIN" | "LOSS" | "OPEN" | "FLAT";
}

function buildTrades(signals: SignalRecord[]): ClosedTrade[] {
  // Work chronologically oldest→newest
  const sorted = [...signals].sort((a, b) => a.signal.ts.localeCompare(b.signal.ts));
  // open positions keyed by symbol
  const open = new Map<string, { ts: string; price: number; notional: number; direction: "LONG" | "SHORT" }>();
  const trades: ClosedTrade[] = [];

  for (const rec of sorted) {
    const { action, symbol, ts, meta } = rec.signal;
    const price = meta?.price ?? 0;
    const noteStr = String(meta?.note ?? "");
    const notional = Number(noteStr.match(/notional:(\d+)/)?.[1] ?? 0);

    if (action === "BUY") {
      open.set(symbol, { ts, price, notional, direction: "LONG" });
    } else if (action === "SHORT") {
      open.set(symbol, { ts, price, notional, direction: "SHORT" });
    } else if (action === "SELL" || action === "COVER") {
      const entry = open.get(symbol);
      if (entry) {
        open.delete(symbol);
        const pnlPct = entry.direction === "LONG"
          ? (price - entry.price) / entry.price
          : (entry.price - price) / entry.price;
        const pnlUsd = Math.round(entry.notional * pnlPct);
        trades.push({
          symbol,
          direction: entry.direction,
          entryTs: entry.ts,
          exitTs: ts,
          entryPrice: entry.price,
          exitPrice: price,
          notional: entry.notional,
          pnlUsd,
          pnlPct: +(pnlPct * 100).toFixed(2),
          status: pnlPct >= 0 ? "WIN" : "LOSS",
        });
      } else {
        // SELL with no open entry — record as standalone exit
        trades.push({
          symbol, direction: "LONG",
          entryTs: ts, exitTs: ts,
          entryPrice: price, exitPrice: price,
          notional, pnlUsd: null, pnlPct: null, status: "FLAT",
        });
      }
    }
  }

  // remaining open positions
  for (const [symbol, entry] of open.entries()) {
    trades.push({
      symbol,
      direction: entry.direction,
      entryTs: entry.ts,
      exitTs: null,
      entryPrice: entry.price,
      exitPrice: null,
      notional: entry.notional,
      pnlUsd: null,
      pnlPct: null,
      status: "OPEN",
    });
  }

  // newest first
  return trades.sort((a, b) => (b.exitTs ?? b.entryTs).localeCompare(a.exitTs ?? a.entryTs));
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border border-border bg-surface/40 px-4 py-3">
      <div className="text-[10px] tracking-widest text-fg-mute">{label}</div>
      <div className={`mt-1 text-lg tabular ${tone ?? "text-fg"}`}>{value}</div>
    </div>
  );
}

export default async function StrategyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail: StrategyDetail | null = await getStrategyDetail(id);
  if (!detail) notFound();

  const bot = botById(id);
  const wallet = bot ? await getWallet(bot).catch(() => null) : null;
  const hourlyCurve = await getEquityCurve(id).catch(() => [] as number[]);

  // Subscriber gate: full trade history unlocks with a valid access key
  const accessKey = (await cookies()).get("qed_access")?.value ?? "";
  const subscribed = accessKey ? await hasAccess(accessKey, id).catch(() => false) : false;

  const { metrics, commit, signals, chain } = detail;
  const { spec } = metrics;
  const specParams = spec.params as {
    handle?: string;
    symbols?: string[];
    profile?: SpecProfile;
  };
  const profile = specParams.profile;
  const handle = specParams.handle;

  return (
    <main className="hud-scanlines relative min-h-screen bg-bg">
      <div className="hud-grid absolute inset-0 opacity-60" />

      <div className="relative z-10 mx-auto max-w-4xl px-6 py-10">
        {/* top bar */}
        <div className="mb-10 flex items-center justify-between text-[11px] tracking-widest">
          <Link
            href="/scoreboard"
            className="text-fg-dim transition-colors hover:text-cyan"
          >
            ← SCOREBOARD
          </Link>
          <span
            className={`flex items-center gap-1.5 ${chain.ok ? "text-green" : "text-danger"}`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${chain.ok ? "bg-green blink" : "bg-danger"}`}
            />
            {chain.ok ? "CHAIN VERIFIED" : `CHAIN TAMPERED @ ${chain.brokenAt}`}
          </span>
        </div>

        {/* header */}
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-3 text-[11px] tracking-widest text-fg-mute">
            <span>{spec.id}</span>
            <span
              className={`rounded-sm border px-1.5 py-0.5 ${STATUS_STYLE[metrics.status]}`}
            >
              {metrics.status}
            </span>
            <span className="text-cyan/80">{spec.market}</span>
            <span>{spec.archetype.toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-4">
            <Avatar seed={profile?.avatarSeed ?? spec.id} size={52} />
            <div>
              <h1
                className="font-serif text-4xl text-fg sm:text-5xl"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {spec.name}
              </h1>
              {handle && (
                <div className="mt-1 flex items-center gap-3 text-[11px] tracking-widest">
                  <span className="text-cyan/70">{handle}</span>
                  {profile && (
                    <>
                      <span className="text-fg-mute">{profile.specialty}</span>
                      <span className={RISK_COLOR[profile.riskLevel]}>
                        {profile.riskLevel.toUpperCase()} RISK
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-fg-dim">
            {spec.thesis}
          </p>
        </div>

        {/* live wallet — the numbers that exist from day one */}
        {wallet && (
          <div className="mb-3 grid grid-cols-3 gap-3">
            <Stat label="EQUITY" value={`$${Math.round(wallet.equity).toLocaleString()}`} tone="text-fg" />
            <Stat
              label="P&L (LIVE)"
              value={`${wallet.realizedPnl + wallet.unrealizedPnl >= 0 ? "+" : "−"}$${Math.abs(Math.round(wallet.realizedPnl + wallet.unrealizedPnl)).toLocaleString()}`}
              tone={wallet.realizedPnl + wallet.unrealizedPnl >= 0 ? "text-green" : "text-danger"}
            />
            <Stat
              label="RETURN"
              value={`${wallet.returnPct >= 0 ? "+" : ""}${(wallet.returnPct * 100).toFixed(2)}%`}
              tone={wallet.returnPct >= 0 ? "text-green" : "text-danger"}
            />
          </div>
        )}

        {/* metrics — real backtest stats from committed signals' real prices */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="LIVE" value={metrics.status === "BACKTEST" ? "—" : `${metrics.liveDays}d`} />
          <Stat label="SIGNALS" value={String(metrics.signalCount)} />
          <Stat
            label="TOTAL RETURN"
            value={metrics.totalReturnPct === null ? "—" : `${metrics.totalReturnPct >= 0 ? "+" : ""}${metrics.totalReturnPct}%`}
            tone={
              metrics.totalReturnPct === null
                ? "text-fg-mute"
                : metrics.totalReturnPct >= 0
                  ? "text-green"
                  : "text-danger"
            }
          />
          <Stat
            label="MAX DD"
            value={`${metrics.maxDrawdownPct.toFixed(1)}%`}
            tone="text-danger/90"
          />
        </div>
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="SHARPE"
            value={metrics.sharpe === null ? "—" : metrics.sharpe.toFixed(2)}
            tone={metrics.sharpe !== null && metrics.sharpe >= 1 ? "text-green" : "text-fg"}
          />
          <Stat
            label="WIN RATE"
            value={metrics.winRatePct === null ? "—" : `${metrics.winRatePct}%`}
          />
          <Stat
            label="EXPOSURE"
            value={metrics.exposurePct === null ? "—" : `${metrics.exposurePct}%`}
          />
          <Stat label="ARCHETYPE" value={spec.archetype.toUpperCase()} />
        </div>

        {/* equity curve — interactive */}
        <div className="mb-8 border border-border bg-surface/30">
          <div className="flex items-center justify-between border-b border-border px-4 py-2 text-[10px] tracking-widest text-fg-mute">
            <span>FORWARD EQUITY CURVE</span>
            <span>{hourlyCurve.length >= 2 ? `5-MIN LIVE · ${hourlyCurve.length} SNAPSHOTS` : `NORMALIZED · ${signals.length} SIGNALS`}</span>
          </div>
          <div className="border-b border-border/50 px-4 py-2 text-[10px] text-fg-mute leading-relaxed">
            {hourlyCurve.length >= 2
              ? "Each point = one 5-minute snapshot of real account equity, including open positions marked to market — the curve moves with the bot's live trades."
              : "Each point = one closed signal. Y-axis = simulated account equity starting from $100,000."}{" "}
            The dashed line marks the $100k starting balance. Hover over any point to see the exact
            dollar value and return % at that moment.
            {signals.length < 4 && hourlyCurve.length < 2 && (
              <span className="ml-2 text-amber/70">Season 1 just started — curve fills in as trades close.</span>
            )}
          </div>
          <div className="px-2 py-4">
            <EquityChart
              curve={hourlyCurve.length >= 2 ? hourlyCurve : metrics.forwardCurve.map((v) => v * 100_000)}
              height={200}
            />
          </div>
        </div>

        {/* closed trades */}
        {(() => {
          const allTrades = buildTrades(signals);
          if (allTrades.length === 0) return null;
          const trades = subscribed ? allTrades : allTrades.slice(0, 3);
          const locked = !subscribed && allTrades.length > trades.length;
          return (
            <div className="mb-8 border border-border bg-surface/30">
              <div className="flex items-center justify-between border-b border-border px-4 py-2 text-[10px] tracking-widest text-fg-mute">
                <span>TRADE HISTORY{subscribed && <span className="ml-2 text-green">· SUBSCRIBER</span>}</span>
                <span>{allTrades.filter((t) => t.status !== "OPEN").length} CLOSED · {allTrades.filter((t) => t.status === "OPEN").length} OPEN</span>
              </div>
              <div className="overflow-x-auto">
                <div className="grid min-w-[860px] grid-cols-[80px_70px_90px_120px_100px_100px_80px_80px_64px] gap-2 border-b border-border/60 px-4 py-2 text-[10px] tracking-widest text-fg-mute">
                  <span>STATUS</span>
                  <span>DIR</span>
                  <span>SYMBOL</span>
                  <span>OPENED</span>
                  <span className="text-right">ENTRY $</span>
                  <span className="text-right">EXIT $</span>
                  <span className="text-right">SIZE</span>
                  <span className="text-right">P&amp;L</span>
                  <span className="text-right">%</span>
                </div>
                {trades.map((t, i) => {
                  const statusColor =
                    t.status === "WIN" ? "text-green border-green/40"
                    : t.status === "LOSS" ? "text-danger border-danger/40"
                    : t.status === "OPEN" ? "text-cyan border-cyan/40"
                    : "text-fg-mute border-border-2";
                  const pnlColor = (t.pnlUsd ?? 0) >= 0 ? "text-green" : "text-danger";
                  return (
                    <div
                      key={i}
                      className="grid min-w-[860px] grid-cols-[80px_70px_90px_120px_100px_100px_80px_80px_64px] items-center gap-2 border-b border-border/40 px-4 py-2 text-[12px]"
                    >
                      <span className={`inline-flex w-fit items-center rounded-sm border px-1.5 py-0.5 text-[10px] tracking-widest ${statusColor}`}>
                        {t.status}
                      </span>
                      <span className={t.direction === "LONG" ? "text-green" : "text-danger"}>
                        {t.direction}
                      </span>
                      <span className="text-fg">{t.symbol}</span>
                      <span className="text-fg-dim tabular">
                        {t.entryTs.slice(0, 10)}{" "}
                        <span className="text-fg-mute">{t.entryTs.slice(11, 16)}</span>
                      </span>
                      <span className="text-right text-fg tabular">
                        {fmtSignalPrice(t.entryPrice)}
                      </span>
                      <span className="text-right text-fg tabular">
                        {t.exitPrice != null ? fmtSignalPrice(t.exitPrice) : <span className="text-fg-mute">—</span>}
                      </span>
                      <span className="text-right text-fg-dim tabular">
                        {t.notional > 0 ? `$${t.notional.toLocaleString()}` : "—"}
                      </span>
                      <span className={`text-right tabular ${t.pnlUsd != null ? pnlColor : "text-fg-mute"}`}>
                        {t.pnlUsd != null
                          ? `${t.pnlUsd >= 0 ? "+" : ""}$${Math.abs(t.pnlUsd).toLocaleString()}`
                          : "—"}
                      </span>
                      <span className={`text-right tabular ${t.pnlPct != null ? pnlColor : "text-fg-mute"}`}>
                        {t.pnlPct != null
                          ? `${t.pnlPct >= 0 ? "+" : ""}${t.pnlPct}%`
                          : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
              {locked && <UnlockBox agentId={id} />}
            </div>
          );
        })()}

        {/* commitment panel */}
        <div className="mb-8 border border-cyan/25 bg-surface/30">
          <div className="border-b border-cyan/20 px-4 py-2 text-[10px] tracking-widest text-cyan/80">
            HASH COMMITMENT — registered before any signal
          </div>
          <div className="grid gap-2 px-4 py-4 text-[12px]">
            <Field k="commit seq" v={String(commit.seq)} />
            <Field k="committed at" v={commit.ts} />
            <Field k="prev hash" v={commit.prevHash} dim />
            <Field k="commit hash" v={commit.hash} accent />
          </div>
        </div>

        {/* immutable signal log — collapsed, verification only */}
        <details className="group border border-border bg-surface/30">
          <summary className="flex cursor-pointer items-center justify-between border-b border-border px-4 py-2 text-[10px] tracking-widest text-fg-mute marker:hidden list-none">
            <span>IMMUTABLE SIGNAL LOG</span>
            <span className="flex items-center gap-2">
              <span>APPEND-ONLY · FORWARD · {signals.length} ENTRIES</span>
              <span className="text-fg-mute group-open:rotate-180 transition-transform">▾</span>
            </span>
          </summary>
          {signals.length === 0 ? (
            <div className="px-4 py-6 text-[12px] text-fg-dim">
              No forward signals yet.
            </div>
          ) : (
            <div className="divide-y divide-border/60 overflow-x-auto">
              <div className="grid min-w-[760px] grid-cols-[140px_56px_90px_90px_80px_48px_1fr] gap-3 px-4 py-2 text-[10px] tracking-widest text-fg-mute">
                <span>TIMESTAMP</span>
                <span>ACTION</span>
                <span>SYMBOL</span>
                <span className="text-right">PRICE</span>
                <span className="text-right">SIZE</span>
                <span className="text-right">CONF</span>
                <span className="text-right">ENTRY HASH</span>
              </div>
              {[...signals].reverse().map((s) => {
                const price = s.signal.meta?.price ?? 0;
                const note = String(s.signal.meta?.note ?? "");
                const notional = note.match(/notional:(\d+)/)?.[1];
                return (
                  <div
                    key={s.seq}
                    className="grid min-w-[760px] grid-cols-[140px_56px_90px_90px_80px_48px_1fr] items-center gap-3 px-4 py-2 text-[12px]"
                  >
                    <span className="text-fg-dim tabular">
                      {s.signal.ts.slice(0, 10)}{" "}
                      <span className="text-fg-mute">{s.signal.ts.slice(11, 16)}</span>
                    </span>
                    <span className={ACTION_COLOR[s.signal.action] ?? "text-fg"}>
                      {s.signal.action}
                    </span>
                    <span className="text-fg">{s.signal.symbol}</span>
                    <span className="text-right text-fg tabular">
                      {price > 0 ? fmtSignalPrice(price) : "—"}
                    </span>
                    <span className="text-right text-fg-dim tabular">
                      {notional ? `$${Number(notional).toLocaleString()}` : "—"}
                    </span>
                    <span className="text-right text-fg-dim tabular">
                      {s.signal.meta?.confidence?.toFixed(2) ?? "—"}
                    </span>
                    <span className="truncate text-right text-cyan/50 tabular">
                      {s.hash.slice(0, 16)}…
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </details>

        <p className="mt-4 text-[10px] leading-relaxed text-fg-mute">
          Verify independently: re-hash each entry from genesis with{" "}
          <span className="text-fg-dim">npm run ledger:verify</span>. Any edit to the
          spec or a past signal changes its hash and breaks the chain.
        </p>
      </div>
    </main>
  );
}

/** Adaptive price formatting — sub-cent memecoins keep their precision. */
function fmtSignalPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  const decimals = Math.min(10, Math.ceil(-Math.log10(n)) + 3);
  return n.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
}

function Field({
  k,
  v,
  dim,
  accent,
}: {
  k: string;
  v: string;
  dim?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3">
      <span className="w-28 shrink-0 text-[10px] tracking-widest text-fg-mute">
        {k}
      </span>
      <span
        className={`break-all tabular ${accent ? "text-cyan" : dim ? "text-fg-mute" : "text-fg"}`}
      >
        {v}
      </span>
    </div>
  );
}
