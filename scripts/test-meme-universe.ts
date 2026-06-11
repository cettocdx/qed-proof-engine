import { getMemeUniverse } from "../lib/market/universe";
import { getBars } from "../lib/market/data";

async function main() {
  const uni = await getMemeUniverse();
  console.log("meme evreni:", uni.length, "coin");
  console.log("ilk 10:", uni.slice(0, 10).join(", "));
  // DEX-only bir coin için CoinGecko fallback testi (binance'te olmayan bir sembol seç)
  const sample = uni[Math.floor(uni.length / 2)];
  console.log("veri testi:", sample);
  const bars = await getBars(sample, "binance", "15m", 160);
  console.log("bar:", bars.length, "son fiyat:", bars[bars.length - 1]?.c);
}
main().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
