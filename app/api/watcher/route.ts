import { NextResponse } from "next/server";
import { checkPositions } from "@/lib/positions/tracker";
import { appendSignal } from "@/lib/ledger/ledger";

export const dynamic = "force-dynamic";

/**
 * Position watcher — call this hourly (or more often) to:
 * 1. Check every open position against the latest price
 * 2. Auto-close positions that hit stop-loss, take-profit, or time limit
 * 3. Append a FLAT/SELL/COVER signal to the ledger when closed
 */

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  // Fail closed: no CRON_SECRET configured → endpoint locked.
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const closed = await checkPositions();

  // For each auto-closed position, write the exit signal to the ledger
  for (const pos of closed) {
    const exitAction = pos.side === "long" ? "SELL" : "COVER";
    await appendSignal({
      strategyId: pos.strategyId,
      ts: pos.exitTs ?? new Date().toISOString(),
      action: exitAction,
      symbol: pos.symbol,
      meta: {
        price: pos.exitPrice,
        confidence: 1.0,
        rationale: `auto-exit: ${pos.closeReason}`,
        note: `watcher:${pos.closeReason} pnl=${pos.pnlPct}%`,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
    checked: closed.length,
    closed: closed.map((p) => ({
      id: p.id,
      strategyId: p.strategyId,
      symbol: p.symbol,
      side: p.side,
      reason: p.closeReason,
      pnlPct: p.pnlPct,
      pnlUsd: p.pnlUsd,
    })),
  });
}

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "use POST in production" }, { status: 405 });
  }
  return POST(req);
}
