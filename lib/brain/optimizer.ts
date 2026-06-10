import { promises as fs } from "node:fs";
import path from "node:path";
import { backtestSkill } from "../strategy/skillBacktest";
import type { Bar } from "../market/data";

/**
 * Walk-forward parameter optimizer.
 *
 * For each (bot, skill) pair, grid-searches the skill's parameter space:
 *   - train  = first 70% of bars  → must be profitable (filters curve-fit noise)
 *   - test   = last  30% of bars  → selection is by TEST score only
 *
 * Best params are persisted to optimized-params.json and loaded by the
 * ensemble at signal time, so every bot trades its own tuned parameters.
 */

const PARAMS_FILE = path.join(process.cwd(), "lib", "data", "optimized-params.json");

/** Parameter grids per skill — kept small so a full run stays fast. */
const GRIDS: Record<string, Record<string, number>[]> = {
  sma_cross: [
    { fast: 10, slow: 40 }, { fast: 20, slow: 50 }, { fast: 30, slow: 60 }, { fast: 10, slow: 60 },
  ],
  rsi_reversion: [
    { period: 10, low: 25, high: 75 }, { period: 14, low: 30, high: 70 },
    { period: 20, low: 35, high: 65 }, { period: 14, low: 25, high: 75 },
  ],
  momentum_12_1: [{ look: 60 }, { look: 90 }, { look: 120 }],
  donchian_breakout: [{ n: 20 }, { n: 40 }, { n: 55 }],
  bollinger_squeeze: [{ n: 15 }, { n: 20 }, { n: 30 }],
  vwap_reversion: [
    { n: 14, band: 0.015 }, { n: 20, band: 0.02 }, { n: 30, band: 0.03 },
  ],
  volume_breakout: [
    { n: 20, minPop: 1.3 }, { n: 30, minPop: 1.5 }, { n: 40, minPop: 2.0 },
  ],
  multi_tf_confirm: [
    { htfFast: 5, htfSlow: 10, look: 12 }, { htfFast: 8, htfSlow: 16, look: 8 },
  ],
};

export interface OptimizedEntry {
  skillId: string;
  params: Record<string, number> | null;
  trainScore: number;
  testScore: number;
  optimizedAt: string;
}

export type OptimizedParams = Record<string, OptimizedEntry>; // key = botId

export async function loadOptimizedParams(): Promise<OptimizedParams> {
  try {
    return JSON.parse(await fs.readFile(PARAMS_FILE, "utf8")) as OptimizedParams;
  } catch {
    return {};
  }
}

export async function saveOptimizedParams(data: OptimizedParams) {
  await fs.mkdir(path.dirname(PARAMS_FILE), { recursive: true });
  await fs.writeFile(PARAMS_FILE, JSON.stringify(data, null, 2), "utf8");
}

/**
 * Optimize one skill on the given bars. Returns the winning entry, or the
 * defaults entry when nothing beats them out-of-sample.
 */
export function optimizeSkill(skillId: string, bars: Bar[]): OptimizedEntry {
  const split = Math.floor(bars.length * 0.7);
  const train = bars.slice(0, split);
  const test = bars.slice(split - 60 > 0 ? split - 60 : 0); // overlap for lookback warm-up

  const candidates: (Record<string, number> | null)[] = [null, ...(GRIDS[skillId] ?? [])];

  let best: OptimizedEntry = {
    skillId, params: null, trainScore: -Infinity, testScore: -Infinity,
    optimizedAt: new Date().toISOString(),
  };

  for (const params of candidates) {
    const trainR = backtestSkill(skillId, train, params ?? undefined);
    if (!trainR) continue;
    const testR = backtestSkill(skillId, test, params ?? undefined);
    if (!testR) continue;

    // Selection by out-of-sample score; in-sample must not be a disaster
    if (trainR.score > -0.05 && testR.score > best.testScore) {
      best = {
        skillId, params,
        trainScore: trainR.score,
        testScore: testR.score,
        optimizedAt: new Date().toISOString(),
      };
    }
  }

  return best;
}
