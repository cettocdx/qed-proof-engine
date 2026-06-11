import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const DATA_DIR = path.join(process.cwd(), "lib", "data");

async function readJsonl<T>(file: string, limit = 50): Promise<T[]> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((l) => { try { return JSON.parse(l) as T; } catch { return null; } })
      .filter(Boolean) as T[];
  } catch { return []; }
}

async function readJson<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(file, "utf8")) as T; }
  catch { return null; }
}

export async function GET() {
  const [errors, lock, waitlist] = await Promise.all([
    readJsonl<{ ts: string; label: string; message: string }>(
      path.join(DATA_DIR, "scheduler-errors.jsonl"), 20
    ),
    readJson<{ id: string; ts: number }>(
      path.join(DATA_DIR, "scheduler-lock.json")
    ),
    readJsonl<{ email: string; agentId: string; ts: string }>(
      path.join(DATA_DIR, "waitlist.jsonl"), 1000
    ),
  ]);

  const lockAgeMs = lock ? Date.now() - lock.ts : null;
  const schedulerAlive = lockAgeMs !== null && lockAgeMs < 90_000;

  return NextResponse.json({
    ts: new Date().toISOString(),
    scheduler: {
      alive: schedulerAlive,
      instanceId: lock?.id ?? null,
      lastHeartbeatMs: lockAgeMs,
    },
    errors: {
      count: errors.length,
      recent: errors.slice(-5).reverse(),
    },
    waitlist: {
      count: waitlist.length,
      recent: waitlist.slice(-3).map((e) => ({ agentId: e.agentId, ts: e.ts })),
    },
  });
}
