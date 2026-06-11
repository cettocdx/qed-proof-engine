"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import SiteNav from "@/components/SiteNav";

type CronResult = {
  ok: boolean;
  ts: string;
  emitted: number;
  chain: { ok: boolean; brokenAt: number | null };
  results: { id: string; name: string; signals: number; note: string }[];
};

type ScoreboardSummary = {
  total: number;
  live: number;
  incub: number;
  backtest: number;
  chainOk: boolean;
};

type Health = {
  ts: string;
  scheduler: { alive: boolean; instanceId: string | null; lastHeartbeatMs: number | null };
  errors: { count: number; recent: { ts: string; label: string; message: string }[] };
  waitlist: { count: number; recent: { agentId: string; ts: string }[] };
};

export default function AdminPage() {
  const { data: session } = useSession();
  const [cronResult, setCronResult] = useState<CronResult | null>(null);
  const [summary, setSummary] = useState<ScoreboardSummary | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const loadAll = () => {
      fetch("/api/scoreboard")
        .then((r) => r.json())
        .then((d) => {
          const strategies = d.strategies as { status: string }[];
          setSummary({
            total: strategies.length,
            live: strategies.filter((s) => s.status === "LIVE").length,
            incub: strategies.filter((s) => s.status === "INCUB").length,
            backtest: strategies.filter((s) => s.status === "BACKTEST").length,
            chainOk: d.chain.ok,
          });
        })
        .catch(() => {});

      fetch("/api/health")
        .then((r) => r.json() as Promise<Health>)
        .then(setHealth)
        .catch(() => {});
    };
    loadAll();
    const id = setInterval(loadAll, 30_000);
    return () => clearInterval(id);
  }, []);

  async function runNow() {
    // Password lives ONLY in server env (CRON_SECRET) — never in the repo.
    const pass = window.prompt("Admin password:");
    if (!pass) return;
    setRunning(true);
    try {
      const r = await fetch("/api/cron/run-bots", {
        method: "POST",
        headers: { authorization: `Bearer ${pass.trim()}` },
      });
      if (r.status === 401) {
        window.alert("Wrong password.");
        setRunning(false);
        return;
      }
      const d = await r.json() as CronResult;
      setCronResult(d);
      // refresh summary
      const sb = await fetch("/api/scoreboard").then((x) => x.json());
      const strategies = sb.strategies as { status: string }[];
      setSummary({
        total: strategies.length,
        live: strategies.filter((s) => s.status === "LIVE").length,
        incub: strategies.filter((s) => s.status === "INCUB").length,
        backtest: strategies.filter((s) => s.status === "BACKTEST").length,
        chainOk: sb.chain.ok,
      });
    } catch (e) {
      console.error(e);
    }
    setRunning(false);
  }

  return (
    <main className="hud-scanlines relative min-h-screen bg-bg">
      <div className="hud-grid absolute inset-0 opacity-30" />
      <div className="relative z-10 mx-auto max-w-5xl px-6 py-8">

        <div className="mb-8"><SiteNav active="/admin" /></div>

        <div className="mb-6 flex items-end justify-between border-b border-border pb-4">
          <div>
            <h1 className="font-serif text-3xl text-fg" style={{ fontFamily: "var(--font-serif)" }}>
              Proof Engine · Admin
            </h1>
            <p className="mt-1 text-sm text-fg-dim">Bot runner · Chain health · Cron status</p>
          </div>
          {session?.user && (
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-fg-mute">{session.user.email}</span>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="border border-border px-3 py-1.5 tracking-widest text-fg-dim hover:border-danger/50 hover:text-danger"
              >
                SIGN OUT
              </button>
            </div>
          )}
        </div>

        {/* summary cards */}
        {summary && (
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "TOTAL", value: summary.total, tone: "text-fg" },
              { label: "LIVE", value: summary.live, tone: "text-green" },
              { label: "INCUB", value: summary.incub, tone: "text-amber" },
              { label: "BACKTEST", value: summary.backtest, tone: "text-fg-dim" },
              { label: "CHAIN", value: summary.chainOk ? "OK" : "BROKEN", tone: summary.chainOk ? "text-green" : "text-danger" },
            ].map((c) => (
              <div key={c.label} className="border border-border bg-surface/30 px-4 py-3">
                <div className="text-[10px] tracking-widest text-fg-mute">{c.label}</div>
                <div className={`mt-1 text-2xl tabular ${c.tone}`}>{c.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* run now */}
        <div className="mb-8 border border-border bg-surface/20 p-5">
          <div className="mb-3 text-[11px] tracking-widest text-fg-mute">MANUAL RUN</div>
          <p className="mb-4 text-sm text-fg-dim">
            Triggers a full universe scan for all 35 agents right now — same pipeline the
            hourly scheduler runs (scan → 4-layer brain → paper execution → position tracking).
            Useful after a deploy or to react to a sudden market move without waiting for the top of the hour.
          </p>
          <button
            onClick={runNow}
            disabled={running}
            className={`border px-5 py-2 text-[12px] tracking-widest transition-colors ${
              running
                ? "border-fg-mute text-fg-mute cursor-wait"
                : "border-cyan text-cyan hover:bg-cyan hover:text-bg"
            }`}
          >
            {running ? "RUNNING…" : "▶ RUN BOTS NOW"}
          </button>
        </div>

        {/* last run result */}
        {cronResult && (
          <div className="mb-8 border border-border bg-surface/20">
            <div className="flex items-center justify-between border-b border-border px-4 py-2 text-[10px] tracking-widest text-fg-mute">
              <span>LAST RUN RESULT</span>
              <span className={cronResult.chain.ok ? "text-green" : "text-danger"}>
                CHAIN {cronResult.chain.ok ? "OK" : "BROKEN"}
              </span>
            </div>
            <div className="px-4 py-3 text-[12px] text-fg-dim">
              <div className="mb-3 flex items-center gap-6">
                <span>{cronResult.ts.slice(0, 19).replace("T", " ")} UTC</span>
                <span className="text-green">{cronResult.emitted} new signals emitted</span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-border/40">
                {cronResult.results.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-1.5">
                    <span className="w-20 text-fg-mute tabular">{r.id}</span>
                    <span className="flex-1 text-fg">{r.name}</span>
                    <span className={`w-6 text-right tabular ${r.signals > 0 ? "text-green" : "text-fg-mute"}`}>
                      {r.signals > 0 ? `+${r.signals}` : "—"}
                    </span>
                    <span className="w-48 text-right text-[11px] text-fg-mute">{r.note}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* health panel */}
        {health && (
          <div className="mb-8 border border-border bg-surface/20">
            <div className="flex items-center justify-between border-b border-border px-4 py-2 text-[10px] tracking-widest text-fg-mute">
              <span>SYSTEM HEALTH</span>
              <span className="text-fg-mute">{health.ts.slice(0, 19).replace("T", " ")} UTC</span>
            </div>
            <div className="grid grid-cols-3 divide-x divide-border">
              {/* scheduler */}
              <div className="px-4 py-3">
                <div className="text-[10px] tracking-widest text-fg-mute mb-1">SCHEDULER</div>
                <div className={`flex items-center gap-1.5 text-[12px] ${health.scheduler.alive ? "text-green" : "text-danger"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${health.scheduler.alive ? "bg-green blink" : "bg-danger"}`} />
                  {health.scheduler.alive ? "ALIVE" : "SILENT"}
                </div>
                {health.scheduler.lastHeartbeatMs !== null && (
                  <div className="mt-1 text-[10px] text-fg-mute">
                    last beat: {Math.round(health.scheduler.lastHeartbeatMs / 1000)}s ago
                  </div>
                )}
                {health.scheduler.instanceId && (
                  <div className="mt-0.5 truncate text-[10px] text-fg-mute">{health.scheduler.instanceId}</div>
                )}
              </div>
              {/* errors */}
              <div className="px-4 py-3">
                <div className="text-[10px] tracking-widest text-fg-mute mb-1">ERRORS (DURABLE)</div>
                <div className={`text-[12px] ${health.errors.count > 0 ? "text-danger" : "text-green"}`}>
                  {health.errors.count === 0 ? "0 errors" : `${health.errors.count} logged`}
                </div>
                {health.errors.recent.map((e, i) => (
                  <div key={i} className="mt-1 text-[10px] text-fg-mute truncate">
                    {e.ts.slice(11, 19)} {e.label}: {e.message.slice(0, 40)}
                  </div>
                ))}
              </div>
              {/* waitlist */}
              <div className="px-4 py-3">
                <div className="text-[10px] tracking-widest text-fg-mute mb-1">WAITLIST</div>
                <div className="text-[12px] text-cyan">{health.waitlist.count} signups</div>
                {health.waitlist.recent.map((e, i) => (
                  <div key={i} className="mt-1 text-[10px] text-fg-mute">
                    {e.ts.slice(0, 10)} · {e.agentId}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* cron schedule info */}
        <div className="border border-border bg-surface/20 p-5 text-[12px]">
          <div className="mb-3 text-[10px] tracking-widest text-fg-mute">SCHEDULE</div>
          <div className="space-y-2 text-fg-dim">
            <div className="flex gap-3">
              <span className="w-32 text-fg-mute">Signal scans</span>
              <span className="text-fg">Every hour — all 35 agents, full universes</span>
            </div>
            <div className="flex gap-3">
              <span className="w-32 text-fg-mute">Position watcher</span>
              <span className="text-fg">Every 30 minutes — stops / targets / time exits</span>
            </div>
            <div className="flex gap-3">
              <span className="w-32 text-fg-mute">Evolution engine</span>
              <span className="text-fg">Nightly 03:00 UTC — skill evolution + walk-forward optimization + LLM coach</span>
            </div>
            <div className="flex gap-3">
              <span className="w-32 text-fg-mute">Runner</span>
              <span className="text-fg">In-app scheduler on Fly.io <code className="text-cyan">qed-proof-engine</code> · 24/7</span>
            </div>
            <div className="flex gap-3">
              <span className="w-32 text-fg-mute">LLM layers</span>
              <span className="text-fg">OpenAI — analyst panel (L3), risk veto (L4), nightly coach</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
