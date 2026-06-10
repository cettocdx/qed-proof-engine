import { SKILLS } from "../strategy/skills";
import { detectRegime, regimeWeight, type RegimeResult } from "./regime";
import type { Bar } from "../market/data";
import type { SignalAction } from "../ledger/schema";

/**
 * Layer 1 — Skill Ensemble (regime-weighted).
 *
 * Runs every applicable skill on the same bars and requires a minimum consensus
 * before passing the signal forward. Votes are weighted by the current market
 * regime: momentum skills count more in trends, reversion skills in ranges,
 * and everything is discounted in chaos.
 *
 * Parameter diversity: each skill also runs with parameter variants, plus the
 * bot's walk-forward-optimized params for its primary skill when available.
 */

export interface EnsembleResult {
  action: SignalAction | null;   // null = no consensus
  confidence: number;            // weighted agreement / 0 if null
  votes: { skillId: string; action: SignalAction; confidence: number; weight: number }[];
  bullVotes: number;
  bearVotes: number;
  totalVoted: number;
  regime: RegimeResult;
}

const BULL: SignalAction[] = ["BUY", "COVER"];
const BEAR: SignalAction[] = ["SELL", "SHORT"];

function isBull(a: SignalAction) { return BULL.includes(a); }
function isBear(a: SignalAction) { return BEAR.includes(a); }

/** Minimum fraction of weighted votes that must agree (directionally) to pass. */
const MIN_CONSENSUS = 0.55; // 55% — slightly above majority

export function runEnsemble(
  bars: Bar[],
  primarySkill: string,
  primaryParams?: Record<string, number> | null,
): EnsembleResult {
  const regime = detectRegime(bars);
  const votes: EnsembleResult["votes"] = [];

  for (const [id, skill] of Object.entries(SKILLS)) {
    if (bars.length < skill.lookback + 2) continue;

    // Base params + parameter variants for diversity
    const paramSets: (Record<string, number> | undefined)[] = [undefined];
    if (id === "sma_cross")         paramSets.push({ fast: 10, slow: 40 }, { fast: 30, slow: 60 });
    if (id === "rsi_reversion")     paramSets.push({ period: 10, low: 25, high: 75 }, { period: 20, low: 35, high: 65 });
    if (id === "momentum_12_1")     paramSets.push({ look: 90 }, { look: 60 });
    if (id === "donchian_breakout") paramSets.push({ n: 20 }, { n: 55 });
    if (id === "bollinger_squeeze") paramSets.push({ n: 15 }, { n: 30 });
    if (id === "vwap_reversion")    paramSets.push({ n: 14, band: 0.015 }, { n: 30, band: 0.03 });
    if (id === "volume_breakout")   paramSets.push({ n: 20, minPop: 1.3 });
    if (id === "multi_tf_confirm")  paramSets.push({ htfFast: 8, htfSlow: 16, look: 8 });

    // Walk-forward-optimized params for the bot's primary skill
    if (id === primarySkill && primaryParams) paramSets.push(primaryParams);

    for (const params of paramSets) {
      try {
        const r = skill.evaluate(bars, params);
        if (r && r.action !== "FLAT") {
          const weight = regimeWeight(id, regime.regime);
          votes.push({ skillId: `${id}${params ? ":v" : ""}`, action: r.action, confidence: r.confidence, weight });
        }
      } catch {
        // skill error → skip
      }
    }
  }

  const bullVotes = votes.filter((v) => isBull(v.action)).length;
  const bearVotes = votes.filter((v) => isBear(v.action)).length;
  const totalVoted = votes.length;

  if (totalVoted === 0) {
    return { action: null, confidence: 0, votes, bullVotes, bearVotes, totalVoted, regime };
  }

  // Regime-weighted consensus
  const bullWeight = votes.filter((v) => isBull(v.action)).reduce((a, v) => a + v.weight, 0);
  const bearWeight = votes.filter((v) => isBear(v.action)).reduce((a, v) => a + v.weight, 0);
  const totalWeight = votes.reduce((a, v) => a + v.weight, 0);

  const bullRatio = bullWeight / totalWeight;
  const bearRatio = bearWeight / totalWeight;

  // Boost confidence for primary skill (the bot's designated skill)
  const primaryVote = votes.find((v) => v.skillId === primarySkill || v.skillId.startsWith(primarySkill));
  const primaryBonus = primaryVote ? 0.1 : 0;

  if (bullRatio >= MIN_CONSENSUS) {
    const bulls = votes.filter((v) => isBull(v.action));
    const avgConf = bulls.reduce((a, v) => a + v.confidence * v.weight, 0) / bullWeight;
    return {
      action: "BUY",
      confidence: Math.min(0.95, avgConf + primaryBonus),
      votes, bullVotes, bearVotes, totalVoted, regime,
    };
  }

  if (bearRatio >= MIN_CONSENSUS) {
    const bears = votes.filter((v) => isBear(v.action));
    const avgConf = bears.reduce((a, v) => a + v.confidence * v.weight, 0) / bearWeight;
    return {
      action: "SELL",
      confidence: Math.min(0.95, avgConf + primaryBonus),
      votes, bullVotes, bearVotes, totalVoted, regime,
    };
  }

  // No consensus
  return { action: null, confidence: 0, votes, bullVotes, bearVotes, totalVoted, regime };
}
