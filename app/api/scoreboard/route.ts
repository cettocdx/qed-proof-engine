import { NextResponse } from "next/server";
import { computeMetrics, verifyChain } from "@/lib/ledger/ledger";

// Always read fresh from the ledger; never cache a track record.
export const dynamic = "force-dynamic";

export async function GET() {
  const [metrics, chain] = await Promise.all([
    computeMetrics(),
    verifyChain(),
  ]);
  return NextResponse.json({ chain, strategies: metrics });
}
