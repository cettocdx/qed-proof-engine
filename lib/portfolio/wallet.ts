import { getAllPositions } from "../positions/tracker";
import { getBars } from "../market/data";
import { ROSTER } from "../bots/roster";
import type { Bot } from "../bots/roster";
import type { Position } from "../positions/tracker";

/**
 * Per-agent wallet. Every agent starts with $100,000 virtual capital.
 *
 *   equity = STARTING_CAPITAL + realized P&L (closed positions)
 *                             + unrealized P&L (open positions, mark-to-market)
 *
 * No separate ledger — the positions log is the source of truth.
 */

export const STARTING_CAPITAL = 100_000;

export interface Wallet {
  strategyId: string;
  name: string;
  startingCapital: number;
  realizedPnl: number;
  unrealizedPnl: number;
  equity: number;
  returnPct: number;       // (equity / starting) - 1
  openPositions: number;
  closedPositions: number;
  wins: number;
  losses: number;
  winRate: number | null;
}

function positionPnl(p: Position, markPrice: number): number {
  const dir = p.side === "long" ? 1 : -1;
  return ((markPrice - p.entryPrice) / p.entryPrice) * dir * p.size;
}

/** Latest close for a symbol — best-effort, returns null on fetch failure. */
async function markPrice(bot: Bot): Promise<number | null> {
  try {
    const bars = await getBars(bot.symbols[0], bot.source, "1h", 2);
    return bars.length ? bars[bars.length - 1].c : null;
  } catch {
    return null;
  }
}

export async function getWallet(bot: Bot, positions?: Position[]): Promise<Wallet> {
  const all = positions ?? (await getAllPositions()).filter((p) => p.strategyId === bot.id);
  const mine = all.filter((p) => p.strategyId === bot.id);

  const closed = mine.filter((p) => p.status === "closed");
  const open = mine.filter((p) => p.status === "open");

  const realizedPnl = closed.reduce((sum, p) => {
    if (typeof p.pnlUsd === "number") return sum + p.pnlUsd;
    if (typeof p.exitPrice === "number") return sum + positionPnl(p, p.exitPrice);
    return sum;
  }, 0);

  let unrealizedPnl = 0;
  if (open.length) {
    const mark = await markPrice(bot);
    if (mark != null) {
      unrealizedPnl = open.reduce((sum, p) => sum + positionPnl(p, mark), 0);
    }
  }

  const wins = closed.filter((p) => (p.pnlUsd ?? 0) > 0).length;
  const losses = closed.filter((p) => (p.pnlUsd ?? 0) < 0).length;
  const equity = STARTING_CAPITAL + realizedPnl + unrealizedPnl;

  return {
    strategyId: bot.id,
    name: bot.name,
    startingCapital: STARTING_CAPITAL,
    realizedPnl: +realizedPnl.toFixed(2),
    unrealizedPnl: +unrealizedPnl.toFixed(2),
    equity: +equity.toFixed(2),
    returnPct: +((equity / STARTING_CAPITAL - 1)).toFixed(4),
    openPositions: open.length,
    closedPositions: closed.length,
    wins,
    losses,
    winRate: closed.length ? +((wins / closed.length)).toFixed(2) : null,
  };
}

export async function getAllWallets(): Promise<Wallet[]> {
  const positions = await getAllPositions();
  const wallets = await Promise.all(ROSTER.map((bot) => getWallet(bot, positions)));
  return wallets.sort((a, b) => b.equity - a.equity);
}
