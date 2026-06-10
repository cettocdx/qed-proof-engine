import type { Bar } from "../market/data";
import { SKILLS } from "./skills";

/**
 * Lightweight skill backtester — signal-flip model.
 *
 * Walks the bars, evaluates the skill at each step, and holds a position in
 * the signalled direction until the skill flips. Used by the optimizer (grid
 * search) and the evolution engine (skill ranking). Deterministic, no fees.
 */

export interface SkillBacktestResult {
  totalReturnPct: number;
  winRate: number | null;
  trades: number;
  sharpe: number | null;
  maxDrawdownPct: number;
  /** Composite fitness used for ranking: return × quality penalties */
  score: number;
}

export function backtestSkill(
  skillId: string,
  bars: Bar[],
  params?: Record<string, number>,
): SkillBacktestResult | null {
  const skill = SKILLS[skillId];
  if (!skill || bars.length < skill.lookback + 20) return null;

  let pos: 1 | -1 | 0 = 0;
  let entryPrice = 0;
  const tradeReturns: number[] = [];
  const barReturns: number[] = [];
  let equity = 1;
  let peak = 1;
  let maxDD = 0;

  for (let i = skill.lookback + 1; i < bars.length; i++) {
    const window = bars.slice(0, i);
    const price = bars[i].c;
    const prevPrice = bars[i - 1].c;

    // mark-to-market bar return for current position
    if (pos !== 0) {
      const r = ((price - prevPrice) / prevPrice) * pos;
      barReturns.push(r);
      equity *= 1 + r;
      peak = Math.max(peak, equity);
      maxDD = Math.max(maxDD, (peak - equity) / peak);
    }

    let signal: ReturnType<typeof skill.evaluate> = null;
    try { signal = skill.evaluate(window, params); } catch { /* skip */ }
    if (!signal) continue;

    const dir = signal.action === "BUY" || signal.action === "COVER" ? 1 : -1;
    if (dir !== pos) {
      if (pos !== 0) {
        tradeReturns.push(((price - entryPrice) / entryPrice) * pos);
      }
      pos = dir as 1 | -1;
      entryPrice = price;
    }
  }
  // close any open trade at the last bar
  if (pos !== 0) {
    const last = bars[bars.length - 1].c;
    tradeReturns.push(((last - entryPrice) / entryPrice) * pos);
  }

  const totalReturnPct = equity - 1;
  const wins = tradeReturns.filter((r) => r > 0).length;
  const winRate = tradeReturns.length ? wins / tradeReturns.length : null;

  let sharpe: number | null = null;
  if (barReturns.length > 10) {
    const mean = barReturns.reduce((a, c) => a + c, 0) / barReturns.length;
    const sd = Math.sqrt(barReturns.reduce((a, c) => a + (c - mean) ** 2, 0) / barReturns.length);
    sharpe = sd > 0 ? (mean / sd) * Math.sqrt(252) : null;
  }

  // Fitness: return penalised by drawdown; tiny trade counts are unreliable
  const reliability = Math.min(1, tradeReturns.length / 5);
  const score = (totalReturnPct - maxDD * 0.5) * reliability;

  return {
    totalReturnPct: +totalReturnPct.toFixed(4),
    winRate: winRate != null ? +winRate.toFixed(2) : null,
    trades: tradeReturns.length,
    sharpe: sharpe != null ? +sharpe.toFixed(2) : null,
    maxDrawdownPct: +maxDD.toFixed(4),
    score: +score.toFixed(4),
  };
}
