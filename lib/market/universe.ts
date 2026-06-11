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
export const CHUNK = { crypto: 60, meme: 25, equity: 50 } as const;

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

/**
 * Meme universe: $500k–$10M market cap micro-caps from CoinGecko's meme
 * categories (main + Solana + Base ecosystems), 1000+ names targeted.
 * Most are DEX-only — price history comes from CoinGecko (see data.ts
 * binance→coingecko fallback via meme-map.json written here).
 */
const MEME_CATEGORIES = ["meme-token", "solana-meme-coins", "base-meme-coins"];
const MEME_MCAP_MIN = 500_000;
const MEME_MCAP_MAX = 10_000_000;

export async function getMemeUniverse(): Promise<string[]> {
  const cached = await readCache("meme-v2");
  if (cached) return cached;
  try {
    const byId = new Map<string, { symbol: string; mcap: number }>();
    for (const cat of MEME_CATEGORIES) {
      for (let page = 1; page <= 5; page++) {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=${cat}&order=market_cap_desc&per_page=250&page=${page}`,
          { headers: { accept: "application/json" } },
        );
        if (!res.ok) break; // rate limit / end — keep what we have
        const coins = (await res.json()) as { id: string; symbol: string; market_cap: number | null }[];
        if (!coins.length) break;
        let inBand = 0;
        for (const c of coins) {
          const mcap = c.market_cap ?? 0;
          if (mcap < MEME_MCAP_MIN || mcap > MEME_MCAP_MAX) continue;
          inBand++;
          if (!byId.has(c.id)) byId.set(c.id, { symbol: c.symbol.toUpperCase(), mcap });
        }
        // mcap-descending: once a full page is below the band, stop paging
        if (inBand === 0 && (coins[coins.length - 1]?.market_cap ?? 0) < MEME_MCAP_MIN) break;
        await new Promise((r) => setTimeout(r, 6000)); // free API: ~10 req/min — daily refresh, so slow is fine
      }
    }

    // Symbol collisions (many "PEPE"s): highest mcap keeps the clean ticker
    const taken = new Set<string>();
    const symbols: string[] = [];
    const map: Record<string, string> = {};
    const ranked = [...byId.entries()].sort((a, b) => b[1].mcap - a[1].mcap);
    for (const [id, { symbol }] of ranked) {
      let sym = `${symbol}-USD`;
      if (taken.has(sym)) sym = `${symbol}.${id.slice(0, 4).toUpperCase()}-USD`;
      if (taken.has(sym)) continue;
      taken.add(sym);
      symbols.push(sym);
      map[sym] = id;
    }

    if (symbols.length > 50) {
      await writeCache("meme-v2", symbols);
      await fs.writeFile(path.join(CACHE_DIR, "meme-map.json"), JSON.stringify(map), "utf8");
    }
    return symbols;
  } catch {
    return (await readCache("meme-v2")) ?? [];
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
  // Meme bots share one chunk per hour (CoinGecko rate budget); other
  // markets stagger per bot for wider coverage.
  const botOffset = kind === "meme" ? 0 : parseInt(bot.id.slice(4), 10) || 0;
  const slotMs = kind === "meme" ? 3_600_000 : 300_000;
  const slot = (Math.floor(Date.now() / slotMs) + botOffset) % chunks;
  const chunk = universe.slice(slot * chunkSize, (slot + 1) * chunkSize);

  const scan = [...new Set([bot.symbols[0], ...openSymbols, ...chunk])];
  return { scan, universeSize: universe.length };
}
