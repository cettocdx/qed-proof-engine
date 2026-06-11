/**
 * In-app scheduler — Node.js only (ENABLE_SCHEDULER=1).
 * Imported by instrumentation.ts only when NEXT_RUNTIME === "nodejs".
 *
 * DISTRIBUTED LOCK: heartbeat to /data/scheduler-lock.json every 30s.
 * Any instance that sees a fresh heartbeat from a different machine stands down.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const LOCK_FILE = path.join(process.cwd(), "lib", "data", "scheduler-lock.json");
const LOCK_TTL_MS = 90_000;
const MY_ID = `${os.hostname()}-${process.pid}`;

async function tryAcquireLock(): Promise<boolean> {
  try {
    const raw = await fs.readFile(LOCK_FILE, "utf8").catch(() => null);
    if (raw) {
      const lock = JSON.parse(raw) as { id: string; ts: number };
      const age = Date.now() - lock.ts;
      if (age < LOCK_TTL_MS && lock.id !== MY_ID) {
        console.log(`[scheduler] lock held by ${lock.id} (${Math.round(age / 1000)}s ago) — standing down`);
        return false;
      }
    }
  } catch { /* corrupt lock file — proceed */ }
  await fs.mkdir(path.dirname(LOCK_FILE), { recursive: true });
  await fs.writeFile(LOCK_FILE, JSON.stringify({ id: MY_ID, ts: Date.now() }), "utf8");
  return true;
}

async function refreshLock() {
  try {
    await fs.writeFile(LOCK_FILE, JSON.stringify({ id: MY_ID, ts: Date.now() }), "utf8");
  } catch { /* non-fatal */ }
}

const ERROR_LOG = path.join(process.cwd(), "lib", "data", "scheduler-errors.jsonl");
async function logError(label: string, message: string) {
  try {
    const entry = JSON.stringify({ ts: new Date().toISOString(), label, message });
    await fs.appendFile(ERROR_LOG, entry + "\n", "utf8");
  } catch { /* never crash on logging */ }
}

if (process.env.ENABLE_SCHEDULER !== "1") {
  // nothing to do
} else {
  const g = globalThis as typeof globalThis & { __qedScheduler?: boolean };
  if (!g.__qedScheduler) {
    // Keep retrying until the lock frees up — on rolling deploys the old
    // instance's lock is still fresh at boot; standing down permanently
    // would leave the cluster with NO scheduler at all.
    const arm = (acquired: boolean) => {
      if (!acquired) {
        setTimeout(() => { void tryAcquireLock().then(arm); }, 60_000);
        return;
      }
      g.__qedScheduler = true;

      const port = process.env.PORT ?? "3000";
      const base = `http://127.0.0.1:${port}`;

      const hit = async (hitPath: string, label: string) => {
        try {
          await refreshLock();
          const headers: Record<string, string> = {};
          if (process.env.CRON_SECRET) headers.authorization = `Bearer ${process.env.CRON_SECRET}`;
          const res = await fetch(`${base}${hitPath}`, { method: "POST", headers, signal: AbortSignal.timeout(290_000) });
          const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          console.log(`[scheduler] ${label}: ${res.status}`, JSON.stringify(body).slice(0, 200));
          if (!res.ok) await logError(label, `HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
        } catch (e) {
          const msg = (e as Error).message;
          console.error(`[scheduler] ${label} failed:`, msg);
          await logError(label, msg);
        }
      };

      setTimeout(() => {
        console.log(`[scheduler] QED scheduler armed — instance:${MY_ID}`);
        void hit("/api/cron/run-bots", "run-bots(boot)");

        setInterval(() => void refreshLock(), 30_000);
        setInterval(() => void hit("/api/cron/run-bots", "run-bots"), 60 * 60 * 1000);
        setInterval(() => void hit("/api/watcher", "watcher"), 30 * 60 * 1000);
        // 5-min equity snapshots — charts track live open-position P&L
        void hit("/api/cron/snapshot", "snapshot(boot)");
        setInterval(() => void hit("/api/cron/snapshot", "snapshot"), 5 * 60 * 1000);

        setInterval(() => {
          const now = new Date();
          if (now.getUTCHours() === 3 && now.getUTCMinutes() < 5) {
            void hit("/api/cron/evolve", "evolve");
          }
          // Daily maintenance 04:00 UTC — retention, backups, expiry reminders
          if (now.getUTCHours() === 4 && now.getUTCMinutes() < 5) {
            void hit("/api/cron/maintenance", "maintenance");
          }
        }, 5 * 60 * 1000);
      }, 30_000);
    };
    void tryAcquireLock().then(arm);
  }
}
