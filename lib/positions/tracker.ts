import { promises as fs } from "node:fs";
import path from "node:path";
import { getDailyBars } from "../market/data";
import type { Market } from "../ledger/schema";
import type { Source } from "../market/data";

/**
 * Position tracker — persists open/closed positions to positions.jsonl.
 *
 * Each bot can have at most one open position at a time. When a new signal
 * flips direction, the existing position is closed and a new one opened.
 *
 * Stop-loss:    2× ATR from entry (real volatility-based stop)
 * Take-profit:  4× ATR from entry (2:1 R/R minimum)
 * Max hold:     30 days (time stop)
 */

const POSITIONS_LOG = path.join(process.cwd(), "lib", "data", "positions.jsonl");
export const STOP_ATR_MULT = 2;
export const TP_ATR_MULT = 4;
export const MAX_HOLD_DAYS = 30;

export type PositionSide = "long" | "short";
export type PositionStatus = "open" | "closed";
export type CloseReason = "signal" | "stop" | "target" | "time" | "manual";

export interface Position {
  id: string;
  strategyId: string;
  symbol: string;
  market: Market;
  source: Source;
  side: PositionSide;
  entryPrice: number;
  entryTs: string;
  size: number;           // notional USD
  stopPrice: number;
  targetPrice: number;
  atr: number;
  status: PositionStatus;
  exitPrice?: number;
  exitTs?: string;
  closeReason?: CloseReason;
  pnlUsd?: number;
  pnlPct?: number;
}

function atr(bars: { h: number; l: number; c: number }[], n = 14): number {
  if (bars.length < n + 1) return bars[bars.length - 1].h - bars[bars.length - 1].l;
  const trs: number[] = [];
  for (let i = bars.length - n; i < bars.length; i++) {
    const prev = bars[i - 1].c;
    trs.push(Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - prev), Math.abs(bars[i].l - prev)));
  }
  return trs.reduce((a, c) => a + c, 0) / n;
}

async function readAll(): Promise<Position[]> {
  try {
    const raw = await fs.readFile(POSITIONS_LOG, "utf8");
    return raw.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Position);
  } catch { return []; }
}

async function writeAll(positions: Position[]) {
  await fs.mkdir(path.dirname(POSITIONS_LOG), { recursive: true });
  await fs.writeFile(POSITIONS_LOG, positions.map((p) => JSON.stringify(p)).join("\n") + "\n");
}

export async function getOpenPositions(): Promise<Position[]> {
  return (await readAll()).filter((p) => p.status === "open");
}

export async function getAllPositions(): Promise<Position[]> {
  return readAll();
}

export async function getPositionFor(strategyId: string): Promise<Position | null> {
  const all = await readAll();
  return all.find((p) => p.strategyId === strategyId && p.status === "open") ?? null;
}

/**
 * Open a new position for a bot signal. Closes any existing open position first.
 */
export async function openPosition(opts: {
  strategyId: string;
  symbol: string;
  market: Market;
  source: Source;
  side: PositionSide;
  entryPrice: number;
  entryTs: string;
  size: number;
  atrBars: { h: number; l: number; c: number }[];
}): Promise<Position> {
  const all = await readAll();
  const a = atr(opts.atrBars);

  // Close existing position for this strategy
  let changed = false;
  for (const p of all) {
    if (p.strategyId === opts.strategyId && p.status === "open") {
      p.status = "closed";
      p.exitPrice = opts.entryPrice;
      p.exitTs = opts.entryTs;
      p.closeReason = "signal";
      const dir = p.side === "long" ? 1 : -1;
      p.pnlPct = +(dir * (opts.entryPrice - p.entryPrice) / p.entryPrice * 100).toFixed(2);
      p.pnlUsd = +(p.size * (p.pnlPct / 100)).toFixed(2);
      changed = true;
    }
  }

  const stop =
    opts.side === "long"
      ? +(opts.entryPrice - STOP_ATR_MULT * a).toFixed(4)
      : +(opts.entryPrice + STOP_ATR_MULT * a).toFixed(4);

  const target =
    opts.side === "long"
      ? +(opts.entryPrice + TP_ATR_MULT * a).toFixed(4)
      : +(opts.entryPrice - TP_ATR_MULT * a).toFixed(4);

  const pos: Position = {
    id: `${opts.strategyId}-${Date.now()}`,
    strategyId: opts.strategyId,
    symbol: opts.symbol,
    market: opts.market,
    source: opts.source,
    side: opts.side,
    entryPrice: opts.entryPrice,
    entryTs: opts.entryTs,
    size: opts.size,
    stopPrice: stop,
    targetPrice: target,
    atr: +a.toFixed(4),
    status: "open",
  };

  all.push(pos);
  if (changed || true) await writeAll(all);
  return pos;
}

/**
 * Check all open positions against latest prices. Returns positions that
 * were closed (stop hit, target hit, or time expired).
 */
export async function checkPositions(): Promise<Position[]> {
  const all = await readAll();
  const open = all.filter((p) => p.status === "open");
  if (open.length === 0) return [];

  const closed: Position[] = [];
  const now = new Date();

  for (const pos of open) {
    let bars;
    try {
      bars = await getDailyBars(pos.symbol, pos.source, 5);
    } catch { continue; }

    const current = bars[bars.length - 1].c;
    const currentTs = new Date(bars[bars.length - 1].t).toISOString();
    const holdDays = (now.getTime() - new Date(pos.entryTs).getTime()) / 86_400_000;

    let closeReason: CloseReason | null = null;

    if (holdDays >= MAX_HOLD_DAYS) {
      closeReason = "time";
    } else if (pos.side === "long") {
      if (current <= pos.stopPrice) closeReason = "stop";
      else if (current >= pos.targetPrice) closeReason = "target";
    } else {
      if (current >= pos.stopPrice) closeReason = "stop";
      else if (current <= pos.targetPrice) closeReason = "target";
    }

    if (closeReason) {
      pos.status = "closed";
      pos.exitPrice = current;
      pos.exitTs = currentTs;
      pos.closeReason = closeReason;
      const dir = pos.side === "long" ? 1 : -1;
      pos.pnlPct = +(dir * (current - pos.entryPrice) / pos.entryPrice * 100).toFixed(2);
      pos.pnlUsd = +(pos.size * (pos.pnlPct / 100)).toFixed(2);
      closed.push(pos);
    }
  }

  if (closed.length > 0) await writeAll(all);
  return closed;
}

/**
 * Portfolio-level P&L summary across all positions.
 */
export async function getPortfolioStats() {
  const all = await readAll();
  const closed = all.filter((p) => p.status === "closed" && p.pnlUsd !== undefined);
  const open = all.filter((p) => p.status === "open");

  const totalPnl = closed.reduce((a, p) => a + (p.pnlUsd ?? 0), 0);
  const wins = closed.filter((p) => (p.pnlUsd ?? 0) > 0).length;
  const winRate = closed.length > 0 ? wins / closed.length : null;
  const avgWin = wins > 0
    ? closed.filter((p) => (p.pnlUsd ?? 0) > 0).reduce((a, p) => a + (p.pnlUsd ?? 0), 0) / wins
    : null;
  const losses = closed.length - wins;
  const avgLoss = losses > 0
    ? closed.filter((p) => (p.pnlUsd ?? 0) <= 0).reduce((a, p) => a + (p.pnlUsd ?? 0), 0) / losses
    : null;

  return {
    openCount: open.length,
    closedCount: closed.length,
    totalPnlUsd: +totalPnl.toFixed(2),
    winRate,
    avgWinUsd: avgWin ? +avgWin.toFixed(2) : null,
    avgLossUsd: avgLoss ? +avgLoss.toFixed(2) : null,
    expectancy: winRate !== null && avgWin !== null && avgLoss !== null
      ? +(winRate * avgWin + (1 - winRate) * avgLoss).toFixed(2)
      : null,
  };
}

export const POSITIONS_LOG_PATH = POSITIONS_LOG;
