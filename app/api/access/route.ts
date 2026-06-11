import { NextResponse } from "next/server";
import { subscriptionsForKey, subscriptionsForEmail } from "@/lib/subscribers/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In-memory sliding-window rate limit per IP — caps access-key guessing.
// (Single Fly machine, so process-local state is sufficient here.)
const HITS = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_HITS = 10;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (HITS.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  HITS.set(ip, recent);
  if (HITS.size > 5000) HITS.clear(); // crude memory cap
  return recent.length > MAX_HITS;
}

/**
 * POST { accessKey } — validate a key; on success set the qed_access cookie
 * and return the active subscriptions it unlocks.
 * POST { email }     — list subscriptions for an email (powers /account;
 * returns only metadata, never access keys).
 */
export async function POST(req: Request) {
  const ip = req.headers.get("fly-client-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "too many attempts — try again shortly" }, { status: 429 });
  }

  const body = await req.json() as { accessKey?: string; email?: string };

  if (body.accessKey) {
    const subs = await subscriptionsForKey(body.accessKey.trim());
    if (subs.length === 0) {
      return NextResponse.json({ error: "invalid or expired access key" }, { status: 401 });
    }
    const res = NextResponse.json({
      ok: true,
      subscriptions: subs.map((s) => ({ agentId: s.agentId, expiresAt: s.expiresAt })),
    });
    res.cookies.set("qed_access", body.accessKey.trim(), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 35,
      path: "/",
    });
    return res;
  }

  if (body.email) {
    const subs = await subscriptionsForEmail(body.email);
    return NextResponse.json({
      ok: true,
      subscriptions: subs.map((s) => ({
        agentId: s.agentId,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        active: new Date(s.expiresAt).getTime() > Date.now(),
      })),
    });
  }

  return NextResponse.json({ error: "accessKey or email required" }, { status: 400 });
}
