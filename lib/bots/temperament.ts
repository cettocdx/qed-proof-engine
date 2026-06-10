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
  bio: `${bot.name} is a ${bot.profile.riskLevel}-risk ${bot.archetype} agent specialised in ${bot.profile.specialty}. ${bot.profile.tagline}`,
  strengths: [`${bot.profile.specialty} expertise`, "Disciplined rule execution", "Tamper-proof track record"],
  weaknesses: ["Single-symbol focus", "Regime changes can hurt"],
  bestMarket: bot.market === "CRYPTO" ? "Trending crypto markets" : "Liquid US large-caps",
});

const BIOS: Record<string, Partial<AgentBio>> = {
  "AGT-001": { bio: "Atlas is the house veteran — a momentum purist that rides Bitcoin's primary trend and refuses to fight it. Built on the classic 12-1 momentum factor, it goes with strength and steps aside in chop.", strengths: ["Long crypto bull legs", "Never fights the tape", "Low churn"], weaknesses: ["Whipsawed in ranging markets", "Late to reversals"] },
  "AGT-002": { bio: "Vega fades panic and sells euphoria on Ethereum. An RSI mean-reversion engine that buys blood and exits into strength — the contrarian of the desk.", strengths: ["Catching capitulation lows", "High win rate in ranges"], weaknesses: ["Bleeds in strong trends", "Early entries"] },
  "AGT-020": { bio: "Hermes is the fastest agent on the desk — a gap-and-go specialist on AMD that exploits overnight information shocks. In by the open's confirmation, out before the close.", strengths: ["Earnings season alpha", "No overnight risk on losers"], weaknesses: ["Needs volatility to eat", "Gap fades hurt"] },
  "AGT-029": { bio: "Doge Rex rides the original memecoin with a momentum engine. When DOGE catches a social-media bid, Rex is already positioned — pure high-octane degen momentum with systematic discipline.", strengths: ["Explosive meme rallies", "Systematic exit discipline"], weaknesses: ["Brutal drawdowns possible", "Sentiment reversals"] },
  "AGT-035": { bio: "Meme Desk is a four-analyst LLM committee that debates every DOGE trade — technical, macro, sentiment and a risk officer with veto power. The only desk where 'degen' meets due diligence.", strengths: ["Multi-perspective analysis", "Risk officer veto", "LLM-powered reasoning"], weaknesses: ["Slower decision cycle", "API dependency"] },
};

export function bioFor(bot: Bot): AgentBio {
  return { ...DEFAULT_BIO(bot), ...BIOS[bot.id] };
}

// ── Hire pricing ───────────────────────────────────────────────────────────
/**
 * Monthly hire price in USD. Base by archetype, scaled by performance:
 *   price = base × (1 + max(0, returnPct) × 4) × temperamentPremium
 * Floors at base/2 for losing agents.
 */
export function hirePriceUsd(bot: Bot, returnPct: number): number {
  const base = bot.archetype === "multi-agent" ? 499 : bot.archetype === "fundamental" ? 349 : 249;
  const perf = 1 + Math.max(0, returnPct) * 4;
  const premium = temperamentFor(bot).kind === "aggressive" ? 1.15 : 1.0;
  const raw = base * perf * premium;
  return Math.max(base / 2, Math.round(raw / 10) * 10);
}
