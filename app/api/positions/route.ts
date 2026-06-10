import { NextResponse } from "next/server";
import { getAllPositions, getPortfolioStats } from "@/lib/positions/tracker";
import { getBars } from "@/lib/market/data";
import { botById } from "@/lib/bots/roster";

export const dynamic = "force-dynamic";

export async function GET() {
  const [positions, stats] = await Promise.all([getAllPositions(), getPortfolioStats()]);
  const open = positions.filter((p) => p.status === "open");
  const closed = positions.filter((p) => p.status === "closed");

  // Mark open positions to the latest price (one fetch per unique symbol)
  const symbols = Array.from(new Set(open.map((p) => `${p.symbol}|${p.source}`)));
  const marks = new Map<string, number>();
  await Promise.all(
    symbols.map(async (key) => {
      const [symbol, source] = key.split("|");
      try {
        const bars = await getBars(symbol, source as "binance" | "yahoo", "1h", 2);
        if (bars.length) marks.set(key, bars[bars.length - 1].c);
      } catch { /* leave unmarked */ }
    }),
  );

  const enrich = (p: (typeof positions)[number]) => ({
    ...p,
    botName: botById(p.strategyId)?.name ?? p.strategyId,
  });

  const openEnriched = open.map((p) => {
    const mark = marks.get(`${p.symbol}|${p.source}`) ?? null;
    const dir = p.side === "long" ? 1 : -1;
    const livePnlPct = mark != null ? ((mark - p.entryPrice) / p.entryPrice) * dir * 100 : null;
    const livePnlUsd = livePnlPct != null ? (livePnlPct / 100) * p.size : null;
    return {
      ...enrich(p),
      currentPrice: mark,
      livePnlPct: livePnlPct != null ? +livePnlPct.toFixed(2) : null,
      livePnlUsd: livePnlUsd != null ? +livePnlUsd.toFixed(2) : null,
    };
  });

  return NextResponse.json({
    stats,
    open: openEnriched,
    closed: closed.slice(-50).map(enrich),
  });
}
