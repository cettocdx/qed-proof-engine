"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

export default function AdminPage() {
  const [cronResult, setCronResult] = useState<CronResult | null>(null);
  const [summary, setSummary] = useState<ScoreboardSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [cronLog, setCronLog] = useState<string>("");

  useEffect(() => {
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

    fetch("/api/cron/log")
      .then((r) => r.json())
      .then((d) => setCronLog(d.log ?? ""))
      .catch(() => {});
  }, []);

  async function runNow() {
    setRunning(true);
    try {
      const r = await fetch("/api/cron/run-bots", { method: "POST" });
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

        <div className="mb-6 border-b border-border pb-4">
          <h1 className="font-serif text-3xl text-fg" style={{ fontFamily: "var(--font-serif)" }}>
            Proof Engine · Admin
          </h1>
          <p className="mt-1 text-sm text-fg-dim">Bot runner · Chain health · Cron status</p>
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
            Triggers a live signal run for all 28 bots right now. Normally this runs automatically every day at 18:30.
            If ANTHROPIC_API_KEY is set, multi-agent desks use Claude.
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

        {/* cron schedule info */}
        <div className="border border-border bg-surface/20 p-5 text-[12px]">
          <div className="mb-3 text-[10px] tracking-widest text-fg-mute">SCHEDULE</div>
          <div className="space-y-2 text-fg-dim">
            <div className="flex gap-3">
              <span className="w-32 text-fg-mute">Schedule</span>
              <span className="text-fg">Every day at 18:30 local time</span>
            </div>
            <div className="flex gap-3">
              <span className="w-32 text-fg-mute">Runner</span>
              <span className="text-fg">macOS LaunchAgent → <code className="text-cyan">com.agentic.daily-bots</code></span>
            </div>
            <div className="flex gap-3">
              <span className="w-32 text-fg-mute">LLM desk</span>
              <span className={process.env.NEXT_PUBLIC_HAS_API_KEY === "1" ? "text-green" : "text-amber"}>
                {typeof window !== "undefined"
                  ? "check ANTHROPIC_API_KEY in .env.local"
                  : "configured server-side"}
              </span>
            </div>
            <div className="flex gap-3">
              <span className="w-32 text-fg-mute">Log file</span>
              <span className="text-fg-dim font-mono">lib/data/cron.log</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
