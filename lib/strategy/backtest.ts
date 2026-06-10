import type { Signal } from "../ledger/schema";

/**
 * Real P&L backtest from the committed signal sequence.
 *
 * Each signal carries the REAL price at emission (meta.price — a real Binance/
 * Yahoo close). We walk the signals in time order, hold the implied position
 * between consecutive signals, and mark equity to the next real price. This is
 * actual realized P&L on real data — not the old toy "confidence nudge" curve.
 *
 * Position model: BUY/COVER -> long (+1), SELL/SHORT -> short (-1), FLAT -> 0.
 * A small per-flip cost approximates slippage + fees so the curve isn't naive.
 */

const FLIP_COST = 0.0008; // 8 bps per position change (round-trip-ish)

export interface BacktestResult {
  curve: number[]; // normalized equity, starts at 1
  totalReturnPct: number;
  maxDrawdownPct: number; // negative
  sharpe: number; // annualized, from per-segment returns
  winRatePct: number; // % of in-position segments that were profitable
  segments: number; // number of held segments
  exposurePct: number; // % of time not flat
}

function positionFor(action: Signal["action"]): number {
  switch (action) {
    case "BUY":
    case "COVER":
      return 1;
    case "SELL":
    case "SHORT":
      return -1;
    case "FLAT":
      return 0;
  }
}

export function backtestFromSignals(signals: Signal[]): BacktestResult {
  const pts = signals
    .filter((s) => typeof s.meta?.price === "number" && s.meta.price! > 0)
    .sort((a, b) => a.ts.localeCompare(b.ts));

  const empty: BacktestResult = {
    curve: [1, 1],
    totalReturnPct: 0,
    maxDrawdownPct: 0,
    sharpe: 0,
    winRatePct: 0,
    segments: 0,
    exposurePct: 0,
  };
  if (pts.length < 2) return empty;

  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  let prevPos = 0;
  const curve: number[] = [1];
  const segReturns: number[] = [];
  const segDays: number[] = [];
  let wins = 0;
  let held = 0;

  for (let i = 0; i < pts.length - 1; i++) {
    const pos = positionFor(pts[i].action);
    const p0 = pts[i].meta!.price!;
    const p1 = pts[i + 1].meta!.price!;
    const move = (p1 - p0) / p0;

    // cost when the position changes from the previous segment
    const cost = pos !== prevPos ? FLIP_COST : 0;
    const segRet = pos * move - cost;
    prevPos = pos;

    equity *= 1 + segRet;
    curve.push(equity);
    segReturns.push(segRet);
    const days = Math.max(
      0.5,
      (new Date(pts[i + 1].ts).getTime() - new Date(pts[i].ts).getTime()) /
        86_400_000,
    );
    segDays.push(days);
    peak = Math.max(peak, equity);
    maxDd = Math.min(maxDd, equity / peak - 1);

    if (pos !== 0) {
      held++;
      if (pos * move > 0) wins++;
    }
  }

  // Sharpe needs a meaningful sample; annualize by the REAL average holding
  // period (segments are multi-day, sparse — not daily), so we don't inflate it.
  let sharpe = 0;
  if (segReturns.length >= 4) {
    const mean = segReturns.reduce((a, c) => a + c, 0) / segReturns.length;
    const variance =
      segReturns.reduce((a, c) => a + (c - mean) ** 2, 0) / segReturns.length;
    const std = Math.sqrt(variance);
    const avgDays =
      segDays.reduce((a, c) => a + c, 0) / (segDays.length || 1);
    const periodsPerYear = 365 / Math.max(1, avgDays);
    sharpe =
      std > 0 ? +((mean / std) * Math.sqrt(periodsPerYear)).toFixed(2) : 0;
  }

  return {
    curve,
    totalReturnPct: +((equity - 1) * 100).toFixed(1),
    maxDrawdownPct: +(maxDd * 100).toFixed(1),
    sharpe,
    winRatePct: held > 0 ? Math.round((wins / held) * 100) : 0,
    segments: segReturns.length,
    exposurePct: segReturns.length
      ? Math.round((held / segReturns.length) * 100)
      : 0,
  };
}
