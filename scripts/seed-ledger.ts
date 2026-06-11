/**
 * Proof-of-loop seed: registers one strategy spec per creator archetype, then
 * emits forward signals — exactly what a real creator agent will do via the
 * same `registerStrategy` / `appendSignal` API. Run:
 *
 *   npx tsx scripts/seed-ledger.ts
 *
 * Re-runnable: it resets the ledger file first so the demo is deterministic.
 */
if (process.env.NODE_ENV === "production") {
  console.error("ERROR: seed-ledger.ts must not run in production — it truncates the ledger.");
  process.exit(1);
}

import { promises as fs } from "node:fs";
import {
  registerStrategy,
  appendSignal,
  verifyChain,
  computeMetrics,
  LEDGER_FILE,
} from "../lib/ledger/ledger";
import type { Archetype, Market, StrategySpec } from "../lib/ledger/schema";

const DAY = 86_400_000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

type Seed = {
  spec: Omit<StrategySpec, "createdAt">;
  ageDays: number;
  signals: number;
  bias: number; // -1..1 drift used for demo confidence
};

const SEEDS: Seed[] = [
  {
    spec: {
      id: "AGT-014",
      name: "VCP Continuation",
      market: "US-EQ" as Market,
      archetype: "systematic" as Archetype,
      creator: "systematic-screener",
      thesis:
        "Minervini volatility-contraction breakouts in Stage-2 uptrends, gated by anti-overfit review.",
      params: { screen: "vcp", minRR: 2.5, stop: "atr" },
    },
    ageDays: 412,
    signals: 24,
    bias: 0.55,
  },
  {
    spec: {
      id: "AGT-027",
      name: "Multi-Agent Desk",
      market: "US-EQ" as Market,
      archetype: "multi-agent" as Archetype,
      creator: "multi-agent-desk",
      thesis:
        "Analyst debate (fundamental/technical/news/sentiment) into a trader+risk decision, TradingAgents-style.",
      params: { analysts: 4, debateRounds: 2 },
    },
    ageDays: 188,
    signals: 16,
    bias: 0.3,
  },
  {
    spec: {
      id: "AGT-031",
      name: "Earnings Thesis Drift",
      market: "US-EQ" as Market,
      archetype: "fundamental" as Archetype,
      creator: "fundamental-research",
      thesis:
        "Post-earnings drift on thesis-confirming prints, sourced from equity-research agents.",
      params: { window: "PEAD", catalyst: "earnings" },
    },
    ageDays: 63,
    signals: 9,
    bias: 0.1,
  },
  {
    spec: {
      id: "AGT-040",
      name: "TradingAgents v0.2 (unproven)",
      market: "US-EQ" as Market,
      archetype: "multi-agent" as Archetype,
      creator: "multi-agent-desk",
      thesis:
        "Famous open framework, registered but not yet forward-tested. Must earn its track record here, live.",
      params: { source: "TauricResearch/TradingAgents" },
    },
    ageDays: 2,
    signals: 0, // backtest-only until it emits live signals
    bias: 0,
  },
];

const SYMBOLS = ["AAPL", "NVDA", "MSFT", "AMD", "META", "AVGO", "CRWD", "PLTR"];

async function main() {
  await fs.rm(LEDGER_FILE, { force: true });

  for (const seed of SEEDS) {
    const createdAt = iso(seed.ageDays * DAY);
    const committed = await registerStrategy({ ...seed.spec, createdAt });
    process.stdout.write(
      `committed ${seed.spec.id} @ ${committed.hash.slice(0, 12)}…\n`,
    );

    for (let i = 0; i < seed.signals; i++) {
      // signals spread across the live window, drifting by bias
      const at = seed.ageDays - Math.floor((i / seed.signals) * seed.ageDays);
      const up = Math.random() < 0.5 + seed.bias * 0.4;
      await appendSignal({
        strategyId: seed.spec.id,
        ts: iso(at * DAY),
        action: up ? "BUY" : "SELL",
        symbol: SYMBOLS[i % SYMBOLS.length],
        meta: {
          confidence: +(0.4 + Math.random() * 0.5).toFixed(2),
          price: +(50 + Math.random() * 400).toFixed(2),
        },
      });
    }
  }

  const chain = await verifyChain();
  const metrics = await computeMetrics();
  process.stdout.write(
    `\nchain verified: ${chain.ok ? "OK" : `BROKEN @ ${chain.brokenAt}`}\n`,
  );
  process.stdout.write(
    `strategies: ${metrics.length} | ledger: ${LEDGER_FILE}\n`,
  );
  for (const m of metrics) {
    process.stdout.write(
      `  ${m.spec.id} ${m.status.padEnd(8)} ${m.signalCount} sig  dd ${m.maxDrawdownPct}%\n`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
