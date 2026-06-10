import type { Bar } from "../market/data";

/**
 * Market regime detection.
 *
 * Classifies the current market as TREND / RANGE / CHAOS using two measures:
 *   - trend strength: |return over N bars| relative to the path travelled
 *     (efficiency ratio — 1 = straight line, 0 = pure noise)
 *   - volatility: ATR% vs its own recent history
 *
 * Ensemble votes are then weighted by how well each skill family fits the
 * regime — momentum skills dominate in trends, reversion skills in ranges,
 * and everything is downweighted in chaos.
 */

export type Regime = "trend" | "range" | "chaos";

export interface RegimeResult {
  regime: Regime;
  efficiency: number;   // 0..1 Kaufman efficiency ratio
  volRatio: number;     // current ATR% / median ATR%
  note: string;
}

type SkillFamily = "momentum" | "reversion" | "breakout";

const SKILL_FAMILY: Record<string, SkillFamily> = {
  sma_cross: "momentum",
  momentum_12_1: "momentum",
  macd_cross: "momentum",
  trend_pullback: "momentum",
  multi_tf_confirm: "momentum",
  rsi_reversion: "reversion",
  bollinger_squeeze: "reversion",
  vwap_reversion: "reversion",
  donchian_breakout: "breakout",
  gap_go: "breakout",
  volume_breakout: "breakout",
};

/** Vote weight for a skill in a given regime. */
const REGIME_WEIGHTS: Record<Regime, Record<SkillFamily, number>> = {
  trend: { momentum: 1.5, breakout: 1.2, reversion: 0.5 },
  range: { momentum: 0.5, breakout: 0.7, reversion: 1.5 },
  chaos: { momentum: 0.6, breakout: 0.6, reversion: 0.6 },
};

function atrPct(bars: Bar[], n = 14): number {
  if (bars.length < n + 1) return 0;
  let sum = 0;
  for (let i = bars.length - n; i < bars.length; i++) {
    const prev = bars[i - 1].c;
    sum += Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - prev), Math.abs(bars[i].l - prev));
  }
  return sum / n / bars[bars.length - 1].c;
}

export function detectRegime(bars: Bar[]): RegimeResult {
  const n = Math.min(40, bars.length - 1);
  const window = bars.slice(-n - 1);

  // Kaufman efficiency ratio
  const net = Math.abs(window[window.length - 1].c - window[0].c);
  let path = 0;
  for (let i = 1; i < window.length; i++) path += Math.abs(window[i].c - window[i - 1].c);
  const efficiency = path > 0 ? net / path : 0;

  // Volatility vs recent history
  const nowAtr = atrPct(bars);
  const histAtrs: number[] = [];
  for (let back = 20; back <= 100 && bars.length - back > 20; back += 20) {
    histAtrs.push(atrPct(bars.slice(0, bars.length - back)));
  }
  const median = histAtrs.length
    ? histAtrs.sort((a, b) => a - b)[Math.floor(histAtrs.length / 2)]
    : nowAtr;
  const volRatio = median > 0 ? nowAtr / median : 1;

  let regime: Regime;
  if (volRatio > 2.2) regime = "chaos";
  else if (efficiency > 0.35) regime = "trend";
  else regime = "range";

  return {
    regime,
    efficiency: +efficiency.toFixed(3),
    volRatio: +volRatio.toFixed(2),
    note: `${regime} (eff=${efficiency.toFixed(2)} vol=${volRatio.toFixed(1)}×)`,
  };
}

/** Multiplier applied to a skill's ensemble vote under the given regime. */
export function regimeWeight(skillId: string, regime: Regime): number {
  const family = SKILL_FAMILY[skillId.replace(/:v$/, "")] ?? "momentum";
  return REGIME_WEIGHTS[regime][family];
}
