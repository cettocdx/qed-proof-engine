import { NextResponse } from "next/server";
import { computeMetrics, verifyChain } from "@/lib/ledger/ledger";
import { getAllEquityCurves } from "@/lib/portfolio/snapshots";

// Always read fresh from the ledger; never cache a track record.
export const dynamic = "force-dynamic";

export async function GET() {
  const [metrics, chain, curves] = await Promise.all([
    computeMetrics(),
    verifyChain(),
    getAllEquityCurves(96).catch(() => new Map<string, number[]>()), // last ~8h of 5-min snapshots
  ]);

  // TREND sparkline: live 5-min equity snapshots (matches the strategy/hire
  // charts); falls back to the signal-based forward curve until 2+ snapshots.
  const strategies = metrics.map((m) => ({
    ...m,
    spark: curves.get(m.spec.id) ?? m.forwardCurve,
  }));

  return NextResponse.json({ chain, strategies });
}
