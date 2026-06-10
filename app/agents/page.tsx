import Link from "next/link";
import Avatar from "@/components/Avatar";
import Wordmark from "@/components/Wordmark";
import { computeMetrics } from "@/lib/ledger/ledger";
import { ROSTER } from "@/lib/bots/roster";
import { SKILLS } from "@/lib/strategy/skills";
import type { StrategyMetrics } from "@/lib/ledger/schema";

export const dynamic = "force-dynamic";

const STATUS_STYLE = {
  LIVE: "text-green border-green/40",
  INCUB: "text-amber border-amber/40",
  BACKTEST: "text-fg-dim border-border-2",
} as const;

const RISK_COLOR = {
  low: "text-green",
  medium: "text-amber",
  high: "text-danger",
} as const;

export default async function AgentsPage() {
  const metrics = await computeMetrics();
  const byId = new Map<string, StrategyMetrics>(
    metrics.map((m) => [m.spec.id, m]),
  );

  const live = metrics.filter((m) => m.status === "LIVE").length;

  return (
    <main className="hud-scanlines relative min-h-screen bg-bg">
      <div className="hud-grid absolute inset-0 opacity-50" />

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-8">
        <header className="mb-10 flex items-center justify-between">
          <Link href="/">
            <Wordmark />
          </Link>
          <nav className="flex items-center gap-6 text-[12px] tracking-widest text-fg-dim">
            <Link href="/" className="transition-colors hover:text-fg">
              SCOREBOARD
            </Link>
            <span className="text-cyan">AGENTS</span>
          </nav>
        </header>

        <div className="mb-8 flex items-end justify-between border-b border-border pb-4">
          <div>
            <h1
              className="font-serif text-4xl text-fg sm:text-5xl"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              The Roster
            </h1>
            <p className="mt-2 max-w-xl text-sm text-fg-dim">
              {ROSTER.length} agents, each running a real strategy skill on live
              market data. {live} currently live and accruing a verifiable
              forward record.
            </p>
          </div>
          <span className="hidden text-[10px] tracking-widest text-fg-mute sm:block">
            REAL DATA · BINANCE + YAHOO
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROSTER.map((bot) => {
            const m = byId.get(bot.id);
            const status = m?.status ?? "BACKTEST";
            const skill = SKILLS[bot.skill];
            return (
              <Link
                key={bot.id}
                href={`/strategy/${bot.id}`}
                className="group border border-border bg-surface/30 p-4 transition-colors hover:border-cyan/40 hover:bg-surface/60"
              >
                <div className="flex items-start gap-3">
                  <Avatar seed={bot.profile.avatarSeed} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-serif text-lg text-fg" style={{ fontFamily: "var(--font-serif)" }}>
                        {bot.name}
                      </span>
                      <span
                        className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[9px] tracking-wider ${STATUS_STYLE[status]}`}
                      >
                        {status}
                      </span>
                    </div>
                    <div className="truncate text-[11px] text-cyan/70">
                      {bot.handle}
                    </div>
                  </div>
                </div>

                <p className="mt-3 line-clamp-2 text-[12px] leading-relaxed text-fg-dim">
                  {bot.profile.tagline}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] tracking-widest text-fg-mute">
                  <span className="text-cyan/70">{bot.market}</span>
                  <span>{skill?.label ?? bot.skill}</span>
                  <span className={RISK_COLOR[bot.profile.riskLevel]}>
                    {bot.profile.riskLevel.toUpperCase()} RISK
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-[11px] tabular">
                  <span className="text-fg-dim">
                    {m ? `${m.signalCount} signals` : "—"}
                  </span>
                  <span className="text-fg-dim">
                    {m && m.totalReturnPct !== null ? (
                      <span className={m.totalReturnPct >= 0 ? "text-green" : "text-danger"}>
                        {m.totalReturnPct >= 0 ? "+" : ""}
                        {m.totalReturnPct}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </span>
                  <span className="text-danger/80">
                    {m ? `${m.maxDrawdownPct.toFixed(1)}%` : "—"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
