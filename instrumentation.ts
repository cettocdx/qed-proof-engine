/**
 * In-app scheduler — replaces the macOS LaunchAgents when running in the cloud.
 *
 * Enabled only when ENABLE_SCHEDULER=1 (set in the production image), so local
 * dev keeps using launchd and never double-fires.
 *
 *   every 15 min  → run all bots (signals + paper orders + positions)
 *   every hour    → position watcher (stops / targets / time exits)
 *   daily 03:00 UTC → evolution cycle (skill evolution + optimization + coach)
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.ENABLE_SCHEDULER !== "1") return;

  const g = globalThis as typeof globalThis & { __qedScheduler?: boolean };
  if (g.__qedScheduler) return; // HMR / double-register guard
  g.__qedScheduler = true;

  const port = process.env.PORT ?? "3000";
  const base = `http://127.0.0.1:${port}`;

  const hit = async (path: string, label: string) => {
    try {
      const res = await fetch(`${base}${path}`, { method: "POST", signal: AbortSignal.timeout(290_000) });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      console.log(`[scheduler] ${label}: ${res.status}`, JSON.stringify(body).slice(0, 200));
    } catch (e) {
      console.error(`[scheduler] ${label} failed:`, (e as Error).message);
    }
  };

  // Wait for the server to be ready before the first run
  setTimeout(() => {
    console.log("[scheduler] QED scheduler armed — bots:1h watcher:30m evolve:daily@03UTC");
    void hit("/api/cron/run-bots", "run-bots(boot)");

    setInterval(() => void hit("/api/cron/run-bots", "run-bots"), 60 * 60 * 1000);
    setInterval(() => void hit("/api/watcher", "watcher"), 30 * 60 * 1000);

    setInterval(() => {
      const now = new Date();
      if (now.getUTCHours() === 3 && now.getUTCMinutes() < 5) {
        void hit("/api/cron/evolve", "evolve");
      }
    }, 5 * 60 * 1000);
  }, 30_000);
}
