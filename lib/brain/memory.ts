import type { Signal } from "../ledger/schema";

/**
 * Layer 2 — Bot Memory.
 *
 * Reads the bot's own committed signal history and derives an adaptive
 * confidence modifier. A bot on a losing streak or in deep drawdown gets
 * a confidence penalty (or a full pause). A bot on a winning streak gets
 * a small boost. No LLM cost — pure math on ledger data.
 */

export interface MemoryResult {
  signalCount: number;
  recentWinRate: number | null;   // last 10 signals
  consecutiveLosses: number;
  consecutiveWins: number;
  inDrawdown: boolean;            // equity < 85% of peak over last 20 signals
  drawdownDepth: number;          // 0..1, 0 = at peak
  modifier: number;               // multiplied into confidence: 0.0 (pause) .. 1.3 (boost)
  note: string;
}

const LOOKBACK = 20;
const RECENT = 10;

function positionFor(action: Signal["action"]): number {
  switch (action) {
    case "BUY": case "COVER": return 1;
    case "SELL": case "SHORT": return -1;
    default: return 0;
  }
}

export function computeMemory(signals: Signal[]): MemoryResult {
  const sorted = [...signals]
    .filter((s) => typeof s.meta?.price === "number" && s.meta.price! > 0)
    .sort((a, b) => a.ts.localeCompare(b.ts));

  const empty: MemoryResult = {
    signalCount: signals.length,
    recentWinRate: null,
    consecutiveLosses: 0,
    consecutiveWins: 0,
    inDrawdown: false,
    drawdownDepth: 0,
    modifier: 1.0,
    note: "insufficient history",
  };

  if (sorted.length < 3) return empty;

  // Build P&L series from price pairs
  const pnl: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const pos = positionFor(sorted[i].action);
    if (pos === 0) continue;
    const p0 = sorted[i].meta!.price!;
    const p1 = sorted[i + 1].meta!.price!;
    pnl.push(pos * (p1 - p0) / p0);
  }

  if (pnl.length === 0) return empty;

  // Equity curve over last LOOKBACK segments
  const window = pnl.slice(-LOOKBACK);
  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  for (const r of window) {
    equity *= 1 + r;
    peak = Math.max(peak, equity);
    maxDd = Math.min(maxDd, equity / peak - 1);
  }
  const drawdownDepth = Math.abs(maxDd);
  const inDrawdown = drawdownDepth > 0.12; // >12% from peak = in drawdown

  // Recent win rate
  const recent = pnl.slice(-RECENT);
  const wins = recent.filter((r) => r > 0).length;
  const recentWinRate = recent.length > 0 ? wins / recent.length : null;

  // Consecutive losses / wins
  let consecutiveLosses = 0;
  let consecutiveWins = 0;
  for (let i = pnl.length - 1; i >= 0; i--) {
    if (pnl[i] < 0) { consecutiveLosses++; consecutiveWins = 0; }
    else if (pnl[i] > 0) break;
  }
  for (let i = pnl.length - 1; i >= 0; i--) {
    if (pnl[i] > 0) { consecutiveWins++; consecutiveLosses = 0; }
    else if (pnl[i] < 0) break;
  }

  // Confidence modifier
  let modifier = 1.0;
  let note = "normal";

  if (consecutiveLosses >= 5 || drawdownDepth > 0.25) {
    modifier = 0.0;
    note = `paused: ${consecutiveLosses} consecutive losses, ${(drawdownDepth * 100).toFixed(0)}% drawdown`;
  } else if (consecutiveLosses >= 3 || drawdownDepth > 0.15) {
    modifier = 0.5;
    note = `cautious: ${consecutiveLosses} losses, ${(drawdownDepth * 100).toFixed(0)}% DD`;
  } else if (inDrawdown) {
    modifier = 0.75;
    note = `in drawdown: ${(drawdownDepth * 100).toFixed(0)}%`;
  } else if (consecutiveWins >= 4 && (recentWinRate ?? 0) > 0.65) {
    modifier = 1.2;
    note = `on a streak: ${consecutiveWins} wins, ${((recentWinRate ?? 0) * 100).toFixed(0)}% recent win rate`;
  } else if ((recentWinRate ?? 0.5) < 0.35) {
    modifier = 0.8;
    note = `below avg: ${((recentWinRate ?? 0) * 100).toFixed(0)}% win rate`;
  }

  return {
    signalCount: signals.length,
    recentWinRate,
    consecutiveLosses,
    consecutiveWins,
    inDrawdown,
    drawdownDepth,
    modifier,
    note,
  };
}
