import { NextResponse } from "next/server";
import { getStrategyDetail, getSpecs } from "@/lib/ledger/ledger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id")?.trim().toUpperCase();

  if (!id) {
    // Return list of all strategy IDs for the autocomplete
    const specs = await getSpecs();
    return NextResponse.json({ ids: specs.map((s) => ({ id: s.id, name: s.name })) });
  }

  const detail = await getStrategyDetail(id);
  if (!detail) {
    return NextResponse.json({ error: `Strategy "${id}" not found in ledger.` }, { status: 404 });
  }

  const { metrics, commit, signals, chain } = detail;

  // Re-derive a quick summary of every entry's hash for display
  const entries = signals.map((s) => ({
    seq: s.seq,
    ts: s.ts,
    action: s.signal.action,
    symbol: s.signal.symbol,
    hash: s.hash,
    prevHash: s.prevHash,
  }));

  return NextResponse.json({
    id,
    name: metrics.spec.name,
    market: metrics.spec.market,
    archetype: metrics.spec.archetype,
    thesis: metrics.spec.thesis,
    commit: {
      seq: commit.seq,
      ts: commit.ts,
      hash: commit.hash,
      prevHash: commit.prevHash,
    },
    chain,
    signalCount: signals.length,
    liveDays: metrics.liveDays,
    status: metrics.status,
    totalReturnPct: metrics.totalReturnPct,
    entries,
  });
}
