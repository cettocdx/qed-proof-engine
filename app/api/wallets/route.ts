import { NextResponse } from "next/server";
import { getAllWallets, STARTING_CAPITAL } from "@/lib/portfolio/wallet";

export const dynamic = "force-dynamic";

export async function GET() {
  const wallets = await getAllWallets();
  const totals = {
    startingCapital: STARTING_CAPITAL * wallets.length,
    equity: +wallets.reduce((s, w) => s + w.equity, 0).toFixed(2),
    realizedPnl: +wallets.reduce((s, w) => s + w.realizedPnl, 0).toFixed(2),
    unrealizedPnl: +wallets.reduce((s, w) => s + w.unrealizedPnl, 0).toFixed(2),
  };
  return NextResponse.json({ ok: true, ts: new Date().toISOString(), totals, wallets });
}
