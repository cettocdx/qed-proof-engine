import { backtestFromSignals, backtestPortfolio } from "../lib/strategy/backtest";
import type { Signal } from "../lib/ledger/schema";

/**
 * Backtest correctness checks — synthetic signals with known outcomes.
 * Run: npx tsx scripts/test-backtest.ts
 */

const FLIP_COST = 0.0008;
let failures = 0;

function check(name: string, got: number, want: number, tol = 0.05) {
  const ok = Math.abs(got - want) <= tol;
  console.log(`${ok ? "✓" : "✗"} ${name}: got ${got}, want ~${want}`);
  if (!ok) failures++;
}

const sig = (ts: string, action: Signal["action"], symbol: string, price: number): Signal => ({
  strategyId: "TEST", ts, action, symbol, meta: { price },
});

// ── 1. Single long leg: BUY@100 → SELL@110 = +10% minus one flip cost ──────
{
  const r = backtestFromSignals([
    sig("2026-01-01T00:00:00Z", "BUY", "AAA", 100),
    sig("2026-01-02T00:00:00Z", "SELL", "AAA", 110),
  ]);
  check("long +10%", r.totalReturnPct, (0.10 - FLIP_COST) * 100);
}

// ── 2. Long then short leg: BUY@100→110 (+10%), SELL@110→99 (+10% short) ──
{
  const r = backtestFromSignals([
    sig("2026-01-01T00:00:00Z", "BUY", "AAA", 100),
    sig("2026-01-02T00:00:00Z", "SELL", "AAA", 110),
    sig("2026-01-03T00:00:00Z", "BUY", "AAA", 99),
  ]);
  // leg1: +10% - cost; leg2: short 110→99 = +10% - cost; compounded
  const want = ((1 + 0.10 - FLIP_COST) * (1 + 0.10 - FLIP_COST) - 1) * 100;
  check("long+short compound", r.totalReturnPct, want);
}

// ── 3. Losing long: BUY@100 → SELL@90 = -10% ───────────────────────────────
{
  const r = backtestFromSignals([
    sig("2026-01-01T00:00:00Z", "BUY", "AAA", 100),
    sig("2026-01-02T00:00:00Z", "SELL", "AAA", 90),
  ]);
  check("long -10%", r.totalReturnPct, (-0.10 - FLIP_COST) * 100);
  check("maxDD matches", r.maxDrawdownPct, (-0.10 - FLIP_COST) * 100, 0.1);
}

// ── 4. Portfolio sleeves: mixing symbols must NOT create phantom P&L ───────
{
  // One flat sleeve (in & out same price) + one +10% sleeve → mean ≈ +5%
  const r = backtestPortfolio([
    sig("2026-01-01T00:00:00Z", "BUY", "AAA", 100),
    sig("2026-01-02T00:00:00Z", "SELL", "AAA", 100),     // 0% - cost
    sig("2026-01-01T12:00:00Z", "BUY", "BBB", 1000),
    sig("2026-01-02T12:00:00Z", "SELL", "BBB", 1100),    // +10% - cost
  ]);
  const want = (((0 - FLIP_COST) + (0.10 - FLIP_COST)) / 2) * 100;
  check("portfolio sleeve mean", r.totalReturnPct, want, 0.2);
}

// ── 5. Cross-symbol price jump is NOT profit (the old bug) ─────────────────
{
  // Same sequence run through the OLD single-stream function would see
  // 100 → 1000 as +900%. Portfolio must see two separate flat sleeves.
  const r = backtestPortfolio([
    sig("2026-01-01T00:00:00Z", "BUY", "AAA", 100),
    sig("2026-01-02T00:00:00Z", "BUY", "BBB", 1000),
  ]);
  check("no phantom cross-symbol P&L", r.totalReturnPct, 0, 0.5);
}

// ── 6. Empty / single signal → 0% ──────────────────────────────────────────
{
  check("empty = 0", backtestFromSignals([]).totalReturnPct, 0, 0.001);
  check("single = 0", backtestFromSignals([sig("2026-01-01T00:00:00Z", "BUY", "AAA", 100)]).totalReturnPct, 0, 0.001);
}

console.log(failures === 0 ? "\nALL BACKTEST CHECKS PASSED ∎" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
