import Link from "next/link";
import { notFound } from "next/navigation";
import Avatar from "@/components/Avatar";
import { getStrategyDetail } from "@/lib/ledger/ledger";
import type { StrategyDetail } from "@/lib/ledger/schema";

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

function EquityCurve({ data }: { data: number[] }) {
  const w = 720;
  const h = 200;
  const pad = 8;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const x = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const y = (v: number) =>
    h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
  const line = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${pad},${h - pad} ${line} ${(w - pad).toFixed(1)},${h - pad}`;
  const up = data[data.length - 1] >= data[0];
  const stroke = up ? "#22c55e" : "#ef4444";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line
          key={g}
          x1={pad}
          x2={w - pad}
          y1={h * g}
          y2={h * g}
          stroke="#1e2a3f"
          strokeWidth="1"
        />
      ))}
      <polygon points={area} fill="url(#eqfill)" />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
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
            href="/"
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

        {/* equity curve */}
        <div className="mb-8 border border-border bg-surface/30">
          <div className="flex items-center justify-between border-b border-border px-4 py-2 text-[10px] tracking-widest text-fg-mute">
            <span>FORWARD EQUITY CURVE</span>
            <span>NORMALIZED · {signals.length} SIGNALS</span>
          </div>
          <div className="px-2 py-3">
            <EquityCurve data={metrics.forwardCurve} />
          </div>
        </div>

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

        {/* immutable signal log */}
        <div className="border border-border bg-surface/30">
          <div className="flex items-center justify-between border-b border-border px-4 py-2 text-[10px] tracking-widest text-fg-mute">
            <span>IMMUTABLE SIGNAL LOG</span>
            <span>APPEND-ONLY · FORWARD</span>
          </div>
          {signals.length === 0 ? (
            <div className="px-4 py-6 text-[12px] text-fg-dim">
              No forward signals yet. This strategy is committed (BACKTEST) and
              must emit live signals to earn a track record.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              <div className="grid grid-cols-[150px_56px_72px_64px_1fr] gap-3 px-4 py-2 text-[10px] tracking-widest text-fg-mute">
                <span>TIMESTAMP</span>
                <span>ACTION</span>
                <span>SYMBOL</span>
                <span className="text-right">CONF</span>
                <span className="text-right">ENTRY HASH</span>
              </div>
              {signals.map((s) => (
                <div
                  key={s.seq}
                  className="grid grid-cols-[150px_56px_72px_64px_1fr] items-center gap-3 px-4 py-2 text-[12px]"
                >
                  <span className="text-fg-dim tabular">
                    {s.signal.ts.slice(0, 10)}{" "}
                    <span className="text-fg-mute">{s.signal.ts.slice(11, 19)}</span>
                  </span>
                  <span className={ACTION_COLOR[s.signal.action] ?? "text-fg"}>
                    {s.signal.action}
                  </span>
                  <span className="text-fg">{s.signal.symbol}</span>
                  <span className="text-right text-fg-dim tabular">
                    {s.signal.meta?.confidence?.toFixed(2) ?? "—"}
                  </span>
                  <span className="truncate text-right text-cyan/50 tabular">
                    {s.hash.slice(0, 16)}…
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="mt-6 text-[11px] leading-relaxed text-fg-dim">
          Verify independently: re-hash each entry from genesis with{" "}
          <span className="text-fg">npm run ledger:verify</span>. Any edit to the
          spec or a past signal changes its hash and breaks the chain.
        </p>
      </div>
    </main>
  );
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
