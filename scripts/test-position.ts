import { config } from "dotenv";
config({ path: ".env.local" });

import { openPosition, checkPositions, getPortfolioStats } from "../lib/positions/tracker";

async function main() {
  const pos = await openPosition({
    strategyId: "AGT-001",
    symbol: "BTC-USD",
    market: "CRYPTO",
    source: "binance",
    side: "short",
    entryPrice: 103000,
    entryTs: new Date().toISOString(),
    size: 1000,
    atrBars: Array(20).fill({ h: 105000, l: 100000, c: 103000 }),
  });

  console.log("Opened:", pos.id);
  console.log(`  Side: ${pos.side}  Entry: ${pos.entryPrice}`);
  console.log(`  Stop: ${pos.stopPrice}  Target: ${pos.targetPrice}  ATR: ${pos.atr}`);
  console.log(`  Stop dist: ${((Math.abs(pos.entryPrice - pos.stopPrice) / pos.entryPrice) * 100).toFixed(1)}%`);
  console.log(`  Target dist: ${((Math.abs(pos.targetPrice - pos.entryPrice) / pos.entryPrice) * 100).toFixed(1)}%`);

  const closed = await checkPositions();
  console.log("\nAuto-closed this check:", closed.length);

  const stats = await getPortfolioStats();
  console.log("\nPortfolio stats:", stats);
}

main().catch(console.error);
