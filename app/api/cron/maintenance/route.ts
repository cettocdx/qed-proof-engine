import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily maintenance — keeps the /data volume healthy:
 *  1. RETENTION  — equity-snapshots.jsonl trimmed to 90 days,
 *                  pending-orders.jsonl trimmed to 30 days.
 *  2. BACKUP     — rotating daily copies of critical JSONL files
 *                  under /data/backups/<YYYY-MM-DD>/ (last 7 kept).
 *  3. REMINDERS  — expiry warning email when a subscription has ≤5
 *                  days left (sent once per order).
 */

const DATA_DIR = path.join(process.cwd(), "lib", "data");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const REMINDED_FILE = path.join(DATA_DIR, "reminders-sent.jsonl");

const CRITICAL_FILES = [
  "ledger.jsonl",
  "subscribers.jsonl",
  "payments.jsonl",
  "pending-orders.jsonl",
  "positions.jsonl",
  "equity-snapshots.jsonl",
  "equity-peaks.json",
  "waitlist.jsonl",
  "skill-overrides.json",
  "coach-notes.json",
];

async function trimJsonl(file: string, keepAfterMs: number, tsField: string): Promise<number> {
  const full = path.join(DATA_DIR, file);
  try {
    const raw = await fs.readFile(full, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const cutoff = Date.now() - keepAfterMs;
    const kept = lines.filter((l) => {
      try {
        const rec = JSON.parse(l) as Record<string, unknown>;
        const ts = new Date(String(rec[tsField] ?? "")).getTime();
        return !Number.isFinite(ts) || ts >= cutoff;
      } catch { return false; }
    });
    if (kept.length < lines.length) {
      await fs.writeFile(full, kept.join("\n") + (kept.length ? "\n" : ""), "utf8");
    }
    return lines.length - kept.length;
  } catch { return 0; }
}

async function backupCriticalFiles(): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10);
  const dest = path.join(BACKUP_DIR, today);
  await fs.mkdir(dest, { recursive: true });
  const copied: string[] = [];
  for (const f of CRITICAL_FILES) {
    try {
      await fs.copyFile(path.join(DATA_DIR, f), path.join(dest, f));
      copied.push(f);
    } catch { /* file may not exist yet */ }
  }
  // Rotate: keep only the newest 7 daily backup dirs
  try {
    const dirs = (await fs.readdir(BACKUP_DIR)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    for (const old of dirs.slice(0, Math.max(0, dirs.length - 7))) {
      await fs.rm(path.join(BACKUP_DIR, old), { recursive: true, force: true });
    }
  } catch { /* non-fatal */ }
  return copied;
}

async function sendExpiryReminders(): Promise<number> {
  const { readSubscribers } = await import("@/lib/subscribers/access");
  const { sendEmail, expiryReminderEmail } = await import("@/lib/email/send");

  let already = new Set<string>();
  try {
    const raw = await fs.readFile(REMINDED_FILE, "utf8");
    already = new Set(raw.split("\n").filter(Boolean).map((l) => {
      try { return String((JSON.parse(l) as { orderId: string }).orderId); } catch { return ""; }
    }));
  } catch { /* none sent yet */ }

  const subs = await readSubscribers();
  const now = Date.now();
  let sent = 0;
  for (const s of subs) {
    if (!s.email || already.has(s.orderId)) continue;
    const msLeft = new Date(s.expiresAt).getTime() - now;
    if (msLeft > 0 && msLeft <= 5 * 24 * 60 * 60 * 1000) {
      const msg = expiryReminderEmail({ agentId: s.agentId, expiresAt: s.expiresAt });
      const ok = await sendEmail(s.email, msg.subject, msg.html);
      if (ok) {
        await fs.appendFile(REMINDED_FILE, JSON.stringify({ orderId: s.orderId, ts: new Date().toISOString() }) + "\n", "utf8");
        sent++;
      }
    }
  }
  return sent;
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  // Fail closed: no CRON_SECRET configured → endpoint locked.
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [snapTrimmed, pendingTrimmed] = await Promise.all([
    trimJsonl("equity-snapshots.jsonl", 90 * 24 * 60 * 60 * 1000, "ts"),
    trimJsonl("pending-orders.jsonl", 30 * 24 * 60 * 60 * 1000, "ts"),
  ]);
  const backedUp = await backupCriticalFiles();
  const reminders = await sendExpiryReminders().catch((e) => {
    console.error("[maintenance] reminders failed:", (e as Error).message);
    return 0;
  });

  const summary = { ok: true, ts: new Date().toISOString(), snapTrimmed, pendingTrimmed, backedUp, reminders };
  console.log("[maintenance]", JSON.stringify(summary));
  return NextResponse.json(summary);
}
