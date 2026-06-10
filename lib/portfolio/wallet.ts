import { getAllPositions } from "../positions/tracker";
import { getSignals } from "../ledger/ledger";
import { backtestPortfolio } from "../strategy/backtest";
import { getBars } from "../market/data";
import { ROSTER } from "../bots/roster";
import type { Bot } from "../bots/roster";
import type { Position } from "../positions/tracker";
import type { Signal } from "../ledger/schema";

/**
 * Per-agent wallet. Every agent starts with $100,000 virtual capital.
 *
 * Equity follows the bot's FULL signal career — the same hash-committed
 * signal sequence the scoreboard RETURN column is computed from — so a bot
 * showing +67% return shows ~$167k equity, consistently:
 *
 *   equity = 100k × (1 + careerReturn)            … realized, to last signal
 *            × (1 + liveMove × direction)          … unrealized, since last signal
 */

export const STARTING_CAPITAL = 100_000;

export interface Wallet {
  strategyId: string;
  name: string;
  startingCapital: number;
  realizedPnl: number;      // career P&L up to the latest signal
  unrealizedPnl: number;    // open move since the latest signal
  equity: number;
  returnPct: number;        // (equity / starting) - 1
  openPositions: number;
  closedPositions: number;
  wins: number;
  losses: number;
  winRate: number | null;
}

function directionOf(action: Signal["action"]): number {
  if (action === "BUY" || action === "COVER") return 1;
  if (action === "SELL" || action === "SHORT") return -1;
  return 0;
}

/** Latest close for a symbol — best-effort. */
async function markPriceFor(symbol: string, bot: Bot): Promise<number | null> {
  try {
    const bars = await getBars(symbol, bot.source, "1h", 2);
    return bars.length ? bars[bars.length - 1].c : null;
  } catch {
    return null;
  }
}

export async function getWallet(
  bot: Bot,
  positions?: Position[],
  signals?: Signal[],
): Promise<Wallet> {
  const sigs = signals ?? (await getSignals(bot.id));
  const bt = backtestPortfolio(sigs);

  // Realized career equity (marked to the last signal's real price)
  const realizedEquity = STARTING_CAPITAL * (1 + bt.totalReturnPct / 100);
  const realizedPnl = realizedEquity - STARTING_CAPITAL;

  // Unrealized: each traded symbol is an equal-weight sleeve; mark the last
  // signal of every sleeve to its live price.
  let unrealizedPnl = 0;
  const bySymbol = new Map<string, Signal>();
  for (const s of [...sigs].sort((a, b) => a.ts.localeCompare(b.ts))) {
    if (typeof s.meta?.price === "number" && s.meta.price > 0) bySymbol.set(s.symbol, s);
  }
  if (bySymbol.size > 0) {
    const sleeveCapital = realizedEquity / bySymbol.size;
    await Promise.all(
      [...bySymbol.values()].map(async (last) => {
        const dir = directionOf(last.action);
        if (dir === 0) return;
        const mark = await markPriceFor(last.symbol, bot);
        if (mark == null) return;
        const move = ((mark - last.meta!.price!) / last.meta!.price!) * dir;
        unrealizedPnl += sleeveCapital * move;
      }),
    );
  }

  const equity = realizedEquity + unrealizedPnl;

  // Trade counts from the position tracker (display detail)
  const mine = (positions ?? (await getAllPositions())).filter((p) => p.strategyId === bot.id);
  const closed = mine.filter((p) => p.status === "closed");
  const open = mine.filter((p) => p.status === "open");
  const wins = closed.filter((p) => (p.pnlUsd ?? 0) > 0).length;
  const losses = closed.filter((p) => (p.pnlUsd ?? 0) < 0).length;

  return {
    strategyId: bot.id,
    name: bot.name,
    startingCapital: STARTING_CAPITAL,
    realizedPnl: +realizedPnl.toFixed(2),
    unrealizedPnl: +unrealizedPnl.toFixed(2),
    equity: +equity.toFixed(2),
    returnPct: +(equity / STARTING_CAPITAL - 1).toFixed(4),
    openPositions: open.length,
    closedPositions: closed.length,
    wins,
    losses,
    winRate: bt.segments > 0 ? +(bt.winRatePct / 100).toFixed(2) : null,
  };
}

export async function getAllWallets(): Promise<Wallet[]> {
  const [positions, allSignals] = await Promise.all([getAllPositions(), getSignals()]);
  const wallets = await Promise.all(
    ROSTER.map((bot) =>
      getWallet(bot, positions, allSignals.filter((s) => s.strategyId === bot.id)),
    ),
  );
  return wallets.sort((a, b) => b.equity - a.equity);
}
