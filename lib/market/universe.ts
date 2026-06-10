import { promises as fs } from "node:fs";
import path from "node:path";
import type { Bot } from "../bots/roster";

/**
 * Dynamic symbol universes — refreshed daily, cached on disk.
 *
 *   crypto  → every tradeable Binance USDT spot pair (~430, the liquid
 *             tradeable subset of the CoinMarketCap top 1000)
 *   meme    → CoinGecko "meme-token" category, market cap > $300k,
 *             intersected with Binance pairs (a candle source is required)
 *   equity  → the full NASDAQ listed-securities file (~3,500 tickers)
 *
 * Universes are scanned in ROTATING CHUNKS: each 5-minute run covers one
 * chunk, so the whole universe is swept continuously without hitting
 * API rate limits. Symbols with open positions are always included.
 */

const CACHE_DIR = path.join(process.cwd(), "lib", "data", "universe-cache");
const TTL_MS = 24 * 60 * 60 * 1000; // refresh daily

// chunk sizes per run (per 5-minute cycle)
export const CHUNK = { crypto: 60, meme: 50, equity: 50 } as const;

async function readCache(name: string): Promise<string[] | null> {
  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, `${name}.json`), "utf8");
    const { ts, symbols } = JSON.parse(raw) as { ts: number; symbols: string[] };
    if (Date.now() - ts < TTL_MS && symbols.length > 0) return symbols;
    return null;
  } catch { return null; }
}

async function writeCache(name: string, symbols: string[]) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(path.join(CACHE_DIR, `${name}.json`), JSON.stringify({ ts: Date.now(), symbols }), "utf8");
}

// Leveraged tokens / stables — not directional trading material
const EXCLUDE_BASES = new Set(["USDC", "FDUSD", "TUSD", "DAI", "EURI", "USDP", "AEUR", "XUSD", "USD1", "BFUSD"]);
const LEVERAGED = /(UP|DOWN|BULL|BEAR)$/;

/** Every tradeable Binance USDT spot pair as "BASE-USD". */
export async function getCryptoUniverse(): Promise<string[]> {
  const cached = await readCache("crypto");
  if (cached) return cached;
  try {
    const res = await fetch("https://api.binance.com/api/v3/exchangeInfo");
    const d = (await res.json()) as { symbols: { symbol: string; baseAsset: string; quoteAsset: string; status: string; isSpotTradingAllowed: boolean }[] };
    const symbols = d.symbols
      .filter((s) => s.quoteAsset === "USDT" && s.status === "TRADING" && s.isSpotTradingAllowed)
      .filter((s) => !EXCLUDE_BASES.has(s.baseAsset) && !LEVERAGED.test(s.baseAsset))
      .map((s) => `${s.baseAsset}-USD`);
    if (symbols.length > 50) await writeCache("crypto", symbols);
    return symbols;
  } catch {
    return (await readCache("crypto")) ?? [];
  }
}

/** CoinGecko meme-token category, mcap > $300k, tradeable on Binance. */
export async function getMemeUniverse(): Promise<string[]> {
  const cached = await readCache("meme");
  if (cached) return cached;
  try {
    const crypto = new Set(await getCryptoUniverse());
    const out: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=meme-token&order=market_cap_desc&per_page=250&page=${page}`,
        { headers: { accept: "application/json" } },
      );
      if (!res.ok) break;
      const coins = (await res.json()) as { symbol: string; market_cap: number | null }[];
      if (!coins.length) break;
      for (const c of coins) {
        if ((c.market_cap ?? 0) <= 300_000) continue;
        const sym = `${c.symbol.toUpperCase()}-USD`;
        if (crypto.has(sym) && !out.includes(sym)) out.push(sym);
      }
    }
    if (out.length > 5) await writeCache("meme", out);
    return out;
  } catch {
    return (await readCache("meme")) ?? [];
  }
}

/** Full NASDAQ listed-securities file. */
export async function getEquityUniverse(): Promise<string[]> {
  const cached = await readCache("equity");
  if (cached) return cached;
  try {
    const res = await fetch("https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt");
    const text = await res.text();
    const symbols: string[] = [];
    for (const line of text.split("\n").slice(1)) {
      const cols = line.split("|");
      if (cols.length < 7) continue;
      const [symbol, , , testIssue, , , etf] = cols;
      // plain common-stock tickers only: no test issues, ETFs, units/rights/warrants
      if (testIssue === "Y" || etf === "Y") continue;
      if (!/^[A-Z]{1,5}$/.test(symbol)) continue;
      symbols.push(symbol);
    }
    if (symbols.length > 500) await writeCache("equity", symbols);
    return symbols;
  } catch {
    return (await readCache("equity")) ?? [];
  }
}

const MEME_BOT_IDS = new Set(["AGT-029", "AGT-030", "AGT-031", "AGT-032", "AGT-033", "AGT-034", "AGT-035"]);

/**
 * The symbols a bot scans THIS run: home symbol + any symbols it holds open
 * positions in (so exits/flips always evaluate) + this cycle's rotating chunk
 * of the full universe.
 */
export async function getScanList(bot: Bot, openSymbols: string[]): Promise<{ scan: string[]; universeSize: number }> {
  const kind = MEME_BOT_IDS.has(bot.id) ? "meme" : bot.market === "CRYPTO" ? "crypto" : "equity";
  const universe =
    kind === "meme" ? await getMemeUniverse()
    : kind === "crypto" ? await getCryptoUniverse()
    : await getEquityUniverse();

  const chunkSize = CHUNK[kind];
  const chunks = Math.max(1, Math.ceil(universe.length / chunkSize));
  // Rotate by wall-clock 5-minute slot, offset per bot so bots cover
  // different parts of the universe in the same cycle.
  const botOffset = parseInt(bot.id.slice(4), 10) || 0;
  const slot = (Math.floor(Date.now() / 300_000) + botOffset) % chunks;
  const chunk = universe.slice(slot * chunkSize, (slot + 1) * chunkSize);

  const scan = [...new Set([bot.symbols[0], ...openSymbols, ...chunk])];
  return { scan, universeSize: universe.length };
}
