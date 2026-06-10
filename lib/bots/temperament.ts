import type { Bot } from "./roster";

/**
 * Trader temperament — each agent has a personality that shapes how it trades.
 *
 *   aggressive  → big size, low confidence bar, trades often, wide stops
 *   balanced    → moderate everything
 *   calm        → small size, high confidence bar, patient, tight risk
 *
 * The temperament multiplies into position sizing and gates signal confidence,
 * so two bots with the same skill behave differently in the market.
 */

export type TemperamentKind = "aggressive" | "balanced" | "calm";

export interface Temperament {
  kind: TemperamentKind;
  label: string;
  /** Fraction of equity risked per trade (notional = equity × riskPct) */
  riskPct: number;
  /** Minimum brain confidence required to act on a signal */
  minConfidence: number;
  /** Stop multiplier scale: >1 = wider stops (lets trades breathe), <1 = tighter */
  stopScale: number;
  /** Human description for the profile page */
  blurb: string;
}

export const TEMPERAMENTS: Record<TemperamentKind, Temperament> = {
  aggressive: {
    kind: "aggressive",
    label: "AGGRESSIVE",
    riskPct: 0.15,        // 15% of equity per trade
    minConfidence: 0.20,
    stopScale: 1.3,
    blurb: "Swings big, acts fast, tolerates drawdown for outsized wins.",
  },
  balanced: {
    kind: "balanced",
    label: "BALANCED",
    riskPct: 0.10,        // 10% of equity per trade
    minConfidence: 0.28,
    stopScale: 1.0,
    blurb: "Steady operator. Takes good setups, sizes sensibly, cuts losers.",
  },
  calm: {
    kind: "calm",
    label: "CALM",
    riskPct: 0.05,        // 5% of equity per trade
    minConfidence: 0.40,
    stopScale: 0.8,
    blurb: "Patient sniper. Waits for high-conviction setups, protects capital first.",
  },
};

/** riskLevel from the roster maps to a temperament. */
const RISK_TO_TEMPERAMENT: Record<Bot["profile"]["riskLevel"], TemperamentKind> = {
  high: "aggressive",
  medium: "balanced",
  low: "calm",
};

export function temperamentFor(bot: Bot): Temperament {
  return TEMPERAMENTS[RISK_TO_TEMPERAMENT[bot.profile.riskLevel]];
}

// ── Rich agent bios for the hire page ─────────────────────────────────────
export interface AgentBio {
  bio: string;
  strengths: string[];
  weaknesses: string[];
  bestMarket: string;
}

const DEFAULT_BIO = (bot: Bot): AgentBio => ({
  bio: `${bot.name} is a ${bot.profile.riskLevel}-risk ${bot.archetype} agent. Home turf: ${bot.profile.specialty}. Every hour it scans its entire market universe, sends the best setup through a 4-layer brain (regime-weighted ensemble → memory → LLM analyst panel → risk veto) and sizes the trade from its live equity. ${bot.profile.tagline}`,
  strengths: ["Full-market universe scanning", "4-layer decision brain with LLM risk veto", "Nightly self-optimization (walk-forward)", "Tamper-proof hash-chained record"],
  weaknesses: ["Needs liquid markets with candle history", "Regime shifts between scans can hurt"],
  bestMarket: bot.market === "CRYPTO" ? "Trending, liquid crypto markets" : "Liquid NASDAQ names",
});

const BIOS: Record<string, Partial<AgentBio>> = {
  "AGT-001": { bio: "Atlas is the house veteran — a momentum purist born on Bitcoin, now hunting the strongest trend across 400+ Binance pairs every hour. It goes with strength, steps aside in chop, and lets the nightly evolution engine retune its parameters.", strengths: ["Catching the market's strongest trend leg", "Never fights the tape", "Low churn"], weaknesses: ["Whipsawed in ranging markets", "Late to reversals"] },
  "AGT-002": { bio: "Vega fades panic and sells euphoria — the desk contrarian. Born on Ethereum, it now sweeps the whole crypto universe for the most stretched, snap-back-ready chart each hour and fades it.", strengths: ["Catching capitulation lows anywhere in the market", "High win rate in ranges"], weaknesses: ["Bleeds in strong trends", "Early entries"] },
  "AGT-020": { bio: "Hermes is the fastest agent on the desk — an overnight-shock hunter scanning thousands of NASDAQ names for explosive gaps with volume confirmation. In on confirmation, out before it fades.", strengths: ["Earnings season alpha across the whole exchange", "No overnight risk on losers"], weaknesses: ["Needs volatility to eat", "Gap fades hurt"] },
  "AGT-029": { bio: "Doge Rex is the alpha of the meme pack. Born on DOGE, it now stalks every meme coin above $300k market cap, riding whichever one catches the social-media bid first — degen momentum with systematic discipline.", strengths: ["Explosive meme rallies, any coin", "Systematic exit discipline"], weaknesses: ["Brutal drawdowns possible", "Sentiment reversals"] },
  "AGT-035": { bio: "Meme Desk is a four-analyst LLM committee for the entire meme market — technical, macro and sentiment analysts debate the hour's best meme setup, then a risk officer with absolute veto signs off. The only desk where 'degen' meets due diligence.", strengths: ["Multi-perspective analysis", "Risk officer veto", "LLM-powered reasoning"], weaknesses: ["Slower decision cycle", "API dependency"] },
};

export function bioFor(bot: Bot): AgentBio {
  return { ...DEFAULT_BIO(bot), ...BIOS[bot.id] };
}

// ── Hire pricing — driven by real money earned + ROI, recomputed live ──────
/**
 * Monthly hire price in USD:
 *
 *   price = base(archetype)
 *         + 5% of profits actually earned this season (realized + unrealized)
 *         + $12 per ROI percentage point
 *
 * A bot that made $8,000 at +8% ROI on a $499 desk: 499 + 400 + 96 = $1,000/mo.
 * Losing bots discount toward the floor: each negative ROI point cuts 3% off
 * base, floored at 40% of base — bad performance gets cheap, never free.
 */
export function hirePriceUsd(
  bot: Bot,
  perf: { pnlUsd: number; returnPct: number },
): number {
  const base = bot.archetype === "multi-agent" ? 499 : bot.archetype === "fundamental" ? 349 : 249;
  const roiPts = perf.returnPct * 100;

  let raw: number;
  if (perf.pnlUsd > 0) {
    raw = base + perf.pnlUsd * 0.05 + Math.max(0, roiPts) * 12;
  } else {
    raw = base * Math.max(0.4, 1 + roiPts * 0.03);
  }
  return Math.max(Math.round(base * 0.4 / 10) * 10, Math.round(raw / 10) * 10);
}
