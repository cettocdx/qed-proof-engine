import { NextResponse } from "next/server";
import { getAllWallets } from "@/lib/portfolio/wallet";
import { appendEquitySnapshot } from "@/lib/portfolio/snapshots";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 5-minute equity snapshot — marks every bot's open positions to the latest
 * market price and appends one row to /data/equity-snapshots.jsonl. The
 * hire/strategy charts plot these rows, so curves move with live trades.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  // Fail closed: no CRON_SECRET configured → endpoint locked.
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const wallets = await getAllWallets();
  const equities = Object.fromEntries(wallets.map((w) => [w.strategyId, +w.equity.toFixed(2)]));
  await appendEquitySnapshot(equities);

  return NextResponse.json({ ok: true, ts: new Date().toISOString(), bots: wallets.length });
}
