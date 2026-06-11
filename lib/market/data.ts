import { promises as fs } from "node:fs";
import path from "node:path";

export interface Bar {
  t: number; // epoch ms (bar open)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type Source = "binance" | "yahoo" | "coingecko";

// Symbol → CoinGecko id map for DEX-only meme coins (written by universe.ts)
import memeMapPath from "node:path";
async function loadMemeMap(): Promise<Record<string, string>> {
  try {
    const p = memeMapPath.join(process.cwd(), "lib", "data", "universe-cache", "meme-map.json");
    return JSON.parse(await fs.readFile(p, "utf8")) as Record<string, string>;
  } catch { return {}; }
}
export type Interval = "1d" | "1h" | "15m" | "5m";

const CACHE_DIR = path.join(process.cwd(), "lib", "data", "market-cache");

// Shorter TTL for intraday bars so they stay fresh during continuous runs
const CG_TTL = 60 * 60 * 1000; // coingecko hourly data — refresh hourly

const CACHE_TTL: Record<Interval, number> = {
  "1d":  6 * 60 * 60 * 1000,  // 6h
  "1h":  15 * 60 * 1000,       // 15min
  "15m": 5  * 60 * 1000,       // 5min
  "5m":  2  * 60 * 1000,       // 2min
};

function cachePath(source: Source, symbol: string, interval: Interval): string {
  const safe = `${source}_${symbol}_${interval}`.replace(/[^a-z0-9_-]/gi, "_");
  return path.join(CACHE_DIR, `${safe}.json`);
}

async function readCache(source: Source, symbol: string, interval: Interval): Promise<Bar[] | null> {
  try {
    const raw = await fs.readFile(cachePath(source, symbol, interval), "utf8");
    const { ts, bars } = JSON.parse(raw) as { ts: number; bars: Bar[] };
    if (Date.now() - ts < CACHE_TTL[interval] && bars.length) return bars;
    return null;
  } catch {
    return null;
  }
}

async function writeCache(source: Source, symbol: string, interval: Interval, bars: Bar[]) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(cachePath(source, symbol, interval), JSON.stringify({ ts: Date.now(), bars }), "utf8");
}

function toBinancePair(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[-/]/g, "");
  if (s.endsWith("USDT")) return s;
  if (s.endsWith("USD")) return s.slice(0, -3) + "USDT";
  return s + "USDT";
}

// Binance interval strings
const BINANCE_INTERVAL: Record<Interval, string> = {
  "1d": "1d", "1h": "1h", "15m": "15m", "5m": "5m",
};

async function fetchBinance(symbol: string, interval: Interval, limit: number): Promise<Bar[]> {
  const pair = toBinancePair(symbol);
  const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${BINANCE_INTERVAL[interval]}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`binance ${pair} ${interval} ${res.status}`);
  const rows = (await res.json()) as unknown[][];
  return rows.map((r) => ({
    t: Number(r[0]),
    o: Number(r[1]),
    h: Number(r[2]),
    l: Number(r[3]),
    c: Number(r[4]),
    v: Number(r[5]),
  }));
}

// Yahoo Finance interval mapping
const YAHOO_INTERVAL: Record<Interval, { interval: string; range: string }> = {
  "1d":  { interval: "1d",  range: "2y"  },
  "1h":  { interval: "60m", range: "60d" },
  "15m": { interval: "15m", range: "5d"  },
  "5m":  { interval: "5m",  range: "1d"  },
};

async function fetchYahoo(symbol: string, interval: Interval, limit: number): Promise<Bar[]> {
  const { interval: yi, range } = YAHOO_INTERVAL[interval];
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${yi}&range=${range}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (agentic proof-engine)" } });
  if (!res.ok) throw new Error(`yahoo ${symbol} ${interval} ${res.status}`);
  const json = (await res.json()) as {
    chart: {
      result?: {
        timestamp: number[];
        indicators: { quote: { open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }[] };
      }[];
    };
  };
  const r = json.chart.result?.[0];
  if (!r) throw new Error(`yahoo ${symbol} empty`);
  const q = r.indicators.quote[0];
  const bars: Bar[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    if (q.close[i] == null) continue;
    bars.push({ t: r.timestamp[i] * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] ?? 0 });
  }
  return bars.slice(-limit);
}

/**
 * CoinGecko price history → pseudo-bars (hourly closes; H/L spans consecutive
 * closes so true-range/ATR stay meaningful). Used for DEX-only meme coins
 * that have no exchange candles.
 */
async function fetchCoinGecko(cgId: string, limit: number): Promise<Bar[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${cgId}/market_chart?vs_currency=usd&days=7`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`coingecko ${cgId} ${res.status}`);
  const json = (await res.json()) as { prices: [number, number][]; total_volumes: [number, number][] };
  const prices = json.prices ?? [];
  if (prices.length < 3) throw new Error(`coingecko ${cgId} empty`);
  const vols = new Map((json.total_volumes ?? []).map(([t, v]) => [t, v]));
  const bars: Bar[] = [];
  for (let i = 1; i < prices.length; i++) {
    const [t, c] = prices[i];
    const prev = prices[i - 1][1];
    bars.push({
      t,
      o: prev,
      h: Math.max(prev, c),
      l: Math.min(prev, c),
      c,
      v: vols.get(t) ?? 0,
    });
  }
  return bars.slice(-limit);
}

/** Fetch bars for a symbol. Interval defaults to daily. Results are cached. */
export async function getDailyBars(symbol: string, source: Source, limit = 260): Promise<Bar[]> {
  return getBars(symbol, source, "1d", limit);
}

export async function getBars(
  symbol: string,
  source: Source,
  interval: Interval = "1d",
  limit = 260,
): Promise<Bar[]> {
  // Cache hit only counts when it can satisfy the requested window —
  // otherwise a small fetch (e.g. limit=2 for mark price) would poison
  // the cache for callers that need full history.
  const cached = await readCache(source, symbol, interval);
  if (cached && cached.length >= limit) return cached.slice(-limit);

  const fetchLimit = Math.max(limit, 200); // always fetch a useful window
  let bars: Bar[];
  if (source === "coingecko") {
    bars = await fetchCoinGecko(symbol, fetchLimit);
  } else if (source === "binance") {
    try {
      bars = await fetchBinance(symbol, interval, fetchLimit);
    } catch (e) {
      // DEX-only meme coin? Fall back to CoinGecko price history.
      const memeMap = await loadMemeMap();
      const cgId = memeMap[symbol];
      if (!cgId) throw e;
      const cgCached = await readCache("coingecko", cgId, "1h");
      if (cgCached && cgCached.length >= Math.min(limit, 150) &&
          Date.now() - 0 < CG_TTL /* ttl handled by readCache */) {
        return cgCached.slice(-limit);
      }
      bars = await fetchCoinGecko(cgId, fetchLimit);
      if (bars.length) await writeCache("coingecko", cgId, "1h", bars);
      return bars.slice(-limit);
    }
  } else {
    bars = await fetchYahoo(symbol, interval, fetchLimit);
  }

  // Never overwrite a longer cache with a shorter one
  if (bars.length && bars.length >= (cached?.length ?? 0)) {
    await writeCache(source, symbol, interval, bars);
  }
  return bars.slice(-limit);
}
