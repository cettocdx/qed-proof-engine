import type { Archetype, Market } from "../ledger/schema";
import type { Source } from "../market/data";

/**
 * The bot roster. Each bot is a named persona with a profile, a market, real
 * data source, a symbol universe, and an assigned strategy skill (its trading
 * logic). The runner turns each into a hash-committed strategy and emits real,
 * data-derived signals.
 *
 * `archetype` is the bot's design lineage (how it's meant to reason); today all
 * bots run their assigned deterministic skill on real bars. Wiring multi-agent /
 * fundamental bots to live LLM execution (Managed Agents API) is the next step —
 * the contract and the ledger do not change when we do.
 */

export interface BotProfile {
  tagline: string;
  specialty: string;
  riskLevel: "low" | "medium" | "high";
  avatarSeed: string;
}

export interface Bot {
  id: string;
  name: string;
  handle: string;
  archetype: Archetype;
  market: Market;
  source: Source;
  symbols: string[];
  skill: string;
  params?: Record<string, number>;
  profile: BotProfile;
}

const id = (n: number) => `AGT-${String(n).padStart(3, "0")}`;

export const ROSTER: Bot[] = [
  // ── crypto / systematic (Binance — verified real data) ──────────────
  { id: id(1), name: "Atlas", handle: "@atlas-momentum", archetype: "systematic", market: "CRYPTO", source: "binance", symbols: ["BTC-USD"], skill: "momentum_12_1", profile: { tagline: "Rides the primary crypto trend, never fights it.", specialty: "BTC momentum", riskLevel: "medium", avatarSeed: "atlas" } },
  { id: id(2), name: "Vega", handle: "@vega-reversion", archetype: "systematic", market: "CRYPTO", source: "binance", symbols: ["ETH-USD"], skill: "rsi_reversion", profile: { tagline: "Fades panic, sells euphoria.", specialty: "ETH mean reversion", riskLevel: "medium", avatarSeed: "vega" } },
  { id: id(3), name: "Orion", handle: "@orion-breakout", archetype: "systematic", market: "CRYPTO", source: "binance", symbols: ["SOL-USD"], skill: "donchian_breakout", profile: { tagline: "Buys new highs before the crowd notices.", specialty: "SOL breakout", riskLevel: "high", avatarSeed: "orion" } },
  { id: id(4), name: "Lyra", handle: "@lyra-cross", archetype: "systematic", market: "CRYPTO", source: "binance", symbols: ["BNB-USD"], skill: "sma_cross", profile: { tagline: "Patient trend-cross follower.", specialty: "BNB trend", riskLevel: "low", avatarSeed: "lyra" } },
  { id: id(5), name: "Draco", handle: "@draco-squeeze", archetype: "systematic", market: "CRYPTO", source: "binance", symbols: ["XRP-USD"], skill: "bollinger_squeeze", profile: { tagline: "Coils with volatility, strikes on expansion.", specialty: "XRP volatility", riskLevel: "high", avatarSeed: "draco" } },
  { id: id(6), name: "Nova", handle: "@nova-macd", archetype: "systematic", market: "CRYPTO", source: "binance", symbols: ["ADA-USD"], skill: "macd_cross", profile: { tagline: "Momentum confirmed, then committed.", specialty: "ADA momentum", riskLevel: "medium", avatarSeed: "nova" } },
  { id: id(7), name: "Sirius", handle: "@sirius-momentum", archetype: "systematic", market: "CRYPTO", source: "binance", symbols: ["AVAX-USD"], skill: "momentum_12_1", profile: { tagline: "The brightest trend wins.", specialty: "AVAX momentum", riskLevel: "high", avatarSeed: "sirius" } },
  { id: id(8), name: "Pollux", handle: "@pollux-breakout", archetype: "systematic", market: "CRYPTO", source: "binance", symbols: ["LINK-USD"], skill: "donchian_breakout", profile: { tagline: "Range is a coiled spring.", specialty: "LINK breakout", riskLevel: "medium", avatarSeed: "pollux" } },
  { id: id(9), name: "Rigel", handle: "@rigel-reversion", archetype: "systematic", market: "CRYPTO", source: "binance", symbols: ["DOT-USD"], skill: "rsi_reversion", profile: { tagline: "Extremes don't last.", specialty: "DOT reversion", riskLevel: "low", avatarSeed: "rigel" } },
  { id: id(10), name: "Mira", handle: "@mira-cross", archetype: "systematic", market: "CRYPTO", source: "binance", symbols: ["LTC-USD"], skill: "sma_cross", profile: { tagline: "Slow and steady trend rider.", specialty: "LTC trend", riskLevel: "low", avatarSeed: "mira" } },
  { id: id(11), name: "Antares", handle: "@antares-squeeze", archetype: "systematic", market: "CRYPTO", source: "binance", symbols: ["ATOM-USD"], skill: "bollinger_squeeze", profile: { tagline: "Volatility compression hunter.", specialty: "ATOM volatility", riskLevel: "high", avatarSeed: "antares" } },
  { id: id(12), name: "Cassi", handle: "@cassi-momentum", archetype: "systematic", market: "CRYPTO", source: "binance", symbols: ["NEAR-USD"], skill: "momentum_12_1", profile: { tagline: "Trend is a friend until the bend.", specialty: "NEAR momentum", riskLevel: "high", avatarSeed: "cassi" } },

  // ── crypto / multi-agent desks ──────────────────────────────────────
  { id: id(13), name: "Helios Desk", handle: "@helios-desk", archetype: "multi-agent", market: "CRYPTO", source: "binance", symbols: ["BTC-USD"], skill: "trend_pullback", profile: { tagline: "Analyst debate → trader → risk, on BTC.", specialty: "BTC discretionary desk", riskLevel: "medium", avatarSeed: "helios" } },
  { id: id(14), name: "Selene Desk", handle: "@selene-desk", archetype: "multi-agent", market: "CRYPTO", source: "binance", symbols: ["ETH-USD"], skill: "macd_cross", profile: { tagline: "Four lenses, one decision.", specialty: "ETH discretionary desk", riskLevel: "medium", avatarSeed: "selene" } },
  { id: id(15), name: "Kronos Desk", handle: "@kronos-desk", archetype: "multi-agent", market: "CRYPTO", source: "binance", symbols: ["SOL-USD"], skill: "donchian_breakout", profile: { tagline: "Risk has the last word.", specialty: "SOL discretionary desk", riskLevel: "high", avatarSeed: "kronos" } },
  { id: id(16), name: "Gaia Desk", handle: "@gaia-desk", archetype: "multi-agent", market: "CRYPTO", source: "binance", symbols: ["AVAX-USD"], skill: "trend_pullback", profile: { tagline: "Buys strength on the dip.", specialty: "AVAX discretionary desk", riskLevel: "medium", avatarSeed: "gaia" } },

  // ── equities / systematic (Yahoo) ───────────────────────────────────
  { id: id(17), name: "Minerva", handle: "@minerva-vcp", archetype: "systematic", market: "US-EQ", source: "yahoo", symbols: ["NVDA"], skill: "trend_pullback", profile: { tagline: "Minervini-style pullback entries.", specialty: "NVDA trend", riskLevel: "medium", avatarSeed: "minerva" } },
  { id: id(18), name: "Apollo", handle: "@apollo-momentum", archetype: "systematic", market: "US-EQ", source: "yahoo", symbols: ["AAPL"], skill: "momentum_12_1", profile: { tagline: "Large-cap momentum, clean and slow.", specialty: "AAPL momentum", riskLevel: "low", avatarSeed: "apollo" } },
  { id: id(19), name: "Athena", handle: "@athena-breakout", archetype: "systematic", market: "US-EQ", source: "yahoo", symbols: ["MSFT"], skill: "donchian_breakout", profile: { tagline: "Breakouts with discipline.", specialty: "MSFT breakout", riskLevel: "medium", avatarSeed: "athena" } },
  { id: id(20), name: "Hermes", handle: "@hermes-gap", archetype: "systematic", market: "US-EQ", source: "yahoo", symbols: ["AMD"], skill: "gap_go", profile: { tagline: "Fast on the gap, gone by the close.", specialty: "AMD gap-and-go", riskLevel: "high", avatarSeed: "hermes" } },
  { id: id(21), name: "Hera", handle: "@hera-reversion", archetype: "systematic", market: "US-EQ", source: "yahoo", symbols: ["META"], skill: "rsi_reversion", profile: { tagline: "Buys the overreaction.", specialty: "META reversion", riskLevel: "medium", avatarSeed: "hera" } },
  { id: id(22), name: "Ares", handle: "@ares-breakout", archetype: "systematic", market: "US-EQ", source: "yahoo", symbols: ["TSLA"], skill: "donchian_breakout", profile: { tagline: "Aggressive momentum, tight stops.", specialty: "TSLA breakout", riskLevel: "high", avatarSeed: "ares" } },
  { id: id(23), name: "Demeter", handle: "@demeter-cross", archetype: "systematic", market: "US-EQ", source: "yahoo", symbols: ["GOOGL"], skill: "sma_cross", profile: { tagline: "Harvests the long trend.", specialty: "GOOGL trend", riskLevel: "low", avatarSeed: "demeter" } },
  { id: id(24), name: "Poseidon", handle: "@poseidon-squeeze", archetype: "systematic", market: "US-EQ", source: "yahoo", symbols: ["AMZN"], skill: "bollinger_squeeze", profile: { tagline: "Rides the wave out of the squeeze.", specialty: "AMZN volatility", riskLevel: "medium", avatarSeed: "poseidon" } },

  // ── equities / fundamental (Yahoo) ──────────────────────────────────
  { id: id(25), name: "Sophia", handle: "@sophia-thesis", archetype: "fundamental", market: "US-EQ", source: "yahoo", symbols: ["AVGO"], skill: "trend_pullback", profile: { tagline: "Thesis-confirming entries only.", specialty: "AVGO earnings thesis", riskLevel: "low", avatarSeed: "sophia" } },
  { id: id(26), name: "Cyrus", handle: "@cyrus-drift", archetype: "fundamental", market: "US-EQ", source: "yahoo", symbols: ["CRWD"], skill: "gap_go", profile: { tagline: "Post-earnings drift specialist.", specialty: "CRWD PEAD", riskLevel: "medium", avatarSeed: "cyrus" } },
  { id: id(27), name: "Juno", handle: "@juno-catalyst", archetype: "fundamental", market: "US-EQ", source: "yahoo", symbols: ["PLTR"], skill: "momentum_12_1", profile: { tagline: "Catalyst-driven conviction.", specialty: "PLTR catalysts", riskLevel: "high", avatarSeed: "juno" } },
  { id: id(28), name: "Themis", handle: "@themis-quality", archetype: "fundamental", market: "US-EQ", source: "yahoo", symbols: ["NFLX"], skill: "trend_pullback", profile: { tagline: "Quality compounders on weakness.", specialty: "NFLX quality", riskLevel: "low", avatarSeed: "themis" } },

  // ── memecoins / systematic (Binance) ────────────────────────────────
  { id: id(29), name: "Doge Rex",   handle: "@dogerex-momentum",  archetype: "systematic", market: "CRYPTO", source: "binance", symbols: ["DOGE-USD"],  skill: "momentum_12_1",   profile: { tagline: "The OG meme rides again.",        specialty: "DOGE momentum",   riskLevel: "high",   avatarSeed: "dogerex"   } },
  { id: id(30), name: "Shiba Inu",  handle: "@shiba-breakout",    archetype: "systematic", market: "CRYPTO", source: "binance", symbols: ["SHIB-USD"],  skill: "donchian_breakout",profile: { tagline: "Trillion-supply, explosive moves.", specialty: "SHIB breakout",   riskLevel: "high",   avatarSeed: "shiba"     } },
  { id: id(31), name: "Pepe",       handle: "@pepe-squeeze",      archetype: "systematic", market: "CRYPTO", source: "binance", symbols: ["PEPE-USD"],  skill: "bollinger_squeeze",profile: { tagline: "From the meme to the moon.",      specialty: "PEPE volatility", riskLevel: "high",   avatarSeed: "pepe"      } },
  { id: id(32), name: "Dogwifhat",  handle: "@wif-macd",          archetype: "systematic", market: "CRYPTO", source: "binance", symbols: ["WIF-USD"],   skill: "macd_cross",       profile: { tagline: "The hat stays on.",                specialty: "WIF momentum",    riskLevel: "high",   avatarSeed: "dogwifhat" } },
  { id: id(33), name: "Bonk",       handle: "@bonk-reversion",    archetype: "systematic", market: "CRYPTO", source: "binance", symbols: ["BONK-USD"],  skill: "rsi_reversion",    profile: { tagline: "Bonk the overbought.",             specialty: "BONK reversion",  riskLevel: "high",   avatarSeed: "bonk"      } },
  { id: id(34), name: "Floki",      handle: "@floki-trend",       archetype: "systematic", market: "CRYPTO", source: "binance", symbols: ["FLOKI-USD"], skill: "trend_pullback",   profile: { tagline: "Viking meme, trend disciple.",    specialty: "FLOKI trend",     riskLevel: "high",   avatarSeed: "floki"     } },

  // ── memecoins / multi-agent desk (Binance) ───────────────────────────
  { id: id(35), name: "Meme Desk",  handle: "@meme-desk",         archetype: "multi-agent", market: "CRYPTO", source: "binance", symbols: ["DOGE-USD"],  skill: "momentum_12_1",   profile: { tagline: "Four analysts, one degen call.",  specialty: "DOGE desk",       riskLevel: "high",   avatarSeed: "memedeskx" } },
];

export function botById(botId: string): Bot | undefined {
  return ROSTER.find((b) => b.id === botId);
}

// ── Symbol universes — every bot scans a whole market, not one ticker ──────
export const CRYPTO_UNIVERSE = [
  "BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD", "ADA-USD",
  "AVAX-USD", "LINK-USD", "DOT-USD", "LTC-USD", "ATOM-USD", "NEAR-USD",
];
export const MEME_UNIVERSE = [
  "DOGE-USD", "SHIB-USD", "PEPE-USD", "WIF-USD", "BONK-USD", "FLOKI-USD",
];
export const EQ_UNIVERSE = [
  "NVDA", "AAPL", "MSFT", "AMD", "META", "TSLA",
  "GOOGL", "AMZN", "AVGO", "CRWD", "PLTR", "NFLX",
];

const MEME_BOT_IDS = new Set(["AGT-029", "AGT-030", "AGT-031", "AGT-032", "AGT-033", "AGT-034", "AGT-035"]);

/**
 * The full symbol list a bot scans each run. Its home symbol (roster
 * `symbols[0]`) comes first; the rest of its market universe follows.
 */
export function universeFor(bot: Bot): string[] {
  const home = bot.symbols[0];
  const pool = MEME_BOT_IDS.has(bot.id)
    ? MEME_UNIVERSE
    : bot.market === "CRYPTO"
      ? CRYPTO_UNIVERSE
      : EQ_UNIVERSE;
  return [home, ...pool.filter((s) => s !== home)];
}
