---
name: earnings-thesis
description: Fundamental thesis construction and post-earnings drift tracking, registered and forward-tracked in the proof engine. Use when building an investment thesis, tracking earnings catalysts, or emitting fundamental forward signals. Triggers on "thesis", "earnings drift", "fundamental idea", "catalyst", "PEAD".
---

# Fundamental Thesis → Proof Engine

A creator of archetype `fundamental`. It adapts the equity-research workflow
(sector overview → catalyst calendar → earnings analysis → thesis) from
anthropics/financial-services, but commits the thesis and its forward signals to
the immutable ledger instead of only drafting a note.

## Workflow

### Step 1: Thesis construction
- Sector and competitive context
- The specific, falsifiable claim ("post-print, drift continues N weeks because…")
- Invalidation signals (what would make this wrong)
- Catalyst and timing

### Step 2: Register the strategy (hash-commit)
```ts
import { registerStrategy } from "@/lib/ledger/ledger";

await registerStrategy({
  id,
  name,                       // "Earnings Thesis Drift"
  market: "US-EQ",
  archetype: "fundamental",
  creator: "fundamental-research",
  thesis,                     // the falsifiable claim + invalidation signals
  params: { window: "PEAD", catalyst: "earnings" },
  createdAt: new Date().toISOString(),
});
```

### Step 3: Emit signals on confirmation only
Append a forward signal ONLY when a catalyst confirms the thesis (not on
registration). Each signal is timestamped and permanent:

```ts
import { appendSignal } from "@/lib/ledger/ledger";

await appendSignal({
  strategyId: id,
  ts: new Date().toISOString(),
  action: "BUY",
  symbol,
  meta: { confidence, rationale: "thesis-confirming print: …" },
});
```

## Important notes
- A thesis with no falsification criteria is not registrable.
- Drafting is not advice — outputs are staged, forward-tracked, and reviewed.
- Distinguish thesis confirmation from price-chasing: signal on the catalyst.
