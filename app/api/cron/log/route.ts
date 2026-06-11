import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const LOG_PATH = path.join(process.cwd(), "lib", "data", "cron.log");

export async function GET(req: Request) {
  // Fail closed: internal log is admin-only.
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const raw = await fs.readFile(LOG_PATH, "utf8");
    // Return last 100 lines
    const lines = raw.trim().split("\n");
    return NextResponse.json({ log: lines.slice(-100).join("\n") });
  } catch {
    return NextResponse.json({ log: "" });
  }
}
