import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

const WAITLIST_FILE = path.join(process.cwd(), "lib", "data", "waitlist.jsonl");

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { email, agentId, agentName } = (await req.json()) as {
      email?: string;
      agentId?: string;
      agentName?: string;
    };

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const entry = JSON.stringify({
      email: email.trim().toLowerCase(),
      agentId: agentId ?? null,
      agentName: agentName ?? null,
      ts: new Date().toISOString(),
    });

    await fs.mkdir(path.dirname(WAITLIST_FILE), { recursive: true });
    await fs.appendFile(WAITLIST_FILE, entry + "\n", "utf8");

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  // Admin-only: list all signups. Fail closed when no secret is configured.
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const raw = await fs.readFile(WAITLIST_FILE, "utf8").catch(() => "");
    const entries = raw
      .split("\n")
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
    return NextResponse.json({ count: entries.length, entries });
  } catch {
    return NextResponse.json({ count: 0, entries: [] });
  }
}
