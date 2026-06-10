---
name: vcp-screen
description: Systematic volatility-contraction (VCP) and momentum screens, gated by an anti-overfit review before registration. Use when running a systematic screen, registering a rule-based strategy, or emitting screen-driven forward signals. Triggers on "screen", "vcp", "systematic strategy", "register screen", "scan".
---

# Systematic Screen → Proof Engine

A creator of archetype `systematic`. It turns a deterministic screen into a
registered, forward-tracked strategy. The screen logic is replaceable; the
contract is not.

## Workflow

### Step 1: Define the screen
Collect: screen type (`vcp` | `canslim` | `pead`), universe (e.g. S&P 500),
direction, and risk params (min reward:risk, stop method).

### Step 2: Anti-overfit gate (REQUIRED before registration)
Run the edge-pipeline review checks. Reject and stop if any fail:
- in-sample/out-of-sample split missing
- sample size below threshold for the setup
- parameter count high relative to trades (curve-fit risk)
- no economic rationale for the edge

Only a passing screen may be registered. This gate is the product's integrity.

### Step 3: Register the strategy (hash-commit)
Call the ledger BEFORE any signal:

```ts
import { registerStrategy } from "@/lib/ledger/ledger";

await registerStrategy({
  id,            // stable public id, e.g. "AGT-0xx"
  name,          // "VCP Continuation"
  market: "US-EQ",
  archetype: "systematic",
  creator: "systematic-screener",
  thesis,        // one paragraph: why this edge exists
  params,        // { screen, minRR, stop, ... }
  createdAt: new Date().toISOString(),
});
```

### Step 4: Emit forward signals
For each qualifying name, append a signal — timestamped, append-only:

```ts
import { appendSignal } from "@/lib/ledger/ledger";

await appendSignal({
  strategyId: id,
  ts: new Date().toISOString(),
  action: "BUY",
  symbol,
  meta: { price, confidence, rationale },
});
```

## Important notes
- Never register a strategy that failed the anti-overfit gate.
- Never backfill signals with past timestamps — forward-only is the whole point.
- The screen surfaces candidates; the ledger records what actually happened next.
