import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Subscriber access layer — the read side of subscribers.jsonl.
 * A subscriber record is written by the payments webhook on confirmed
 * payment; this module is what the app uses to GATE premium content.
 *
 * Identity = access key (random token issued at fulfillment, delivered
 * by email). The customer enters it once; it is stored in a cookie.
 */

const SUBSCRIBERS_FILE = path.join(process.cwd(), "lib", "data", "subscribers.jsonl");

export type Subscriber = {
  email: string | null;
  agentId: string;
  orderId: string;
  paymentId: string;
  accessKey: string;
  amountUsd: number | null;
  paidCurrency: string | null;
  createdAt: string;
  expiresAt: string;
};

export function newAccessKey(): string {
  return `qed_${randomBytes(12).toString("hex")}`;
}

export async function readSubscribers(): Promise<Subscriber[]> {
  try {
    const raw = await fs.readFile(SUBSCRIBERS_FILE, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l) as Subscriber; } catch { return null; } })
      .filter((s): s is Subscriber => s !== null);
  } catch {
    return [];
  }
}

function isActive(s: Subscriber): boolean {
  return new Date(s.expiresAt).getTime() > Date.now();
}

/** All ACTIVE subscriptions unlocked by this access key. */
export async function subscriptionsForKey(accessKey: string): Promise<Subscriber[]> {
  if (!accessKey) return [];
  const all = await readSubscribers();
  return all.filter((s) => s.accessKey === accessKey && isActive(s));
}

/** All subscriptions (active + expired) for an email — powers /account. */
export async function subscriptionsForEmail(email: string): Promise<Subscriber[]> {
  if (!email) return [];
  const norm = email.trim().toLowerCase();
  const all = await readSubscribers();
  return all.filter((s) => (s.email ?? "").toLowerCase() === norm);
}

/** Does this access key unlock this specific agent right now? */
export async function hasAccess(accessKey: string, agentId: string): Promise<boolean> {
  const subs = await subscriptionsForKey(accessKey);
  return subs.some((s) => s.agentId === agentId);
}
