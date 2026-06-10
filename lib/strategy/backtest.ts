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

/**
 * Multi-symbol career backtest. Signals are grouped per symbol into
 * independent "sleeves" (mixing symbols in one sequence would compute P&L
 * from price jumps between different assets). Sleeve results are combined
 * equal-weight: total return is the mean across sleeves.
 */
export function backtestPortfolio(signals: Signal[]): BacktestResult {
  const bySymbol = new Map<string, Signal[]>();
  for (const s of signals) {
    const arr = bySymbol.get(s.symbol) ?? [];
    arr.push(s);
    bySymbol.set(s.symbol, arr);
  }

  const sleeves = [...bySymbol.values()]
    .map((sigs) => backtestFromSignals(sigs))
    .filter((r) => r.segments > 0);

  if (sleeves.length === 0) return backtestFromSignals(signals);
  if (sleeves.length === 1) return sleeves[0];

  const mean = (xs: number[]) => xs.reduce((a, c) => a + c, 0) / xs.length;
  const longest = sleeves.reduce((a, c) => (c.curve.length > a.curve.length ? c : a));
  const totalSegs = sleeves.reduce((a, c) => a + c.segments, 0);

  return {
    curve: longest.curve,
    totalReturnPct: +mean(sleeves.map((s) => s.totalReturnPct)).toFixed(1),
    maxDrawdownPct: +Math.min(...sleeves.map((s) => s.maxDrawdownPct)).toFixed(1),
    sharpe: +mean(sleeves.map((s) => s.sharpe)).toFixed(2),
    winRatePct: Math.round(
      sleeves.reduce((a, c) => a + c.winRatePct * c.segments, 0) / totalSegs,
    ),
    segments: totalSegs,
    exposurePct: Math.round(mean(sleeves.map((s) => s.exposurePct))),
  };
}
