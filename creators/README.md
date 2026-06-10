# Agentic Creators

Strategy-creator agents. Every creator — regardless of archetype — does exactly
two things against the proof engine, through one contract:

1. **Register** a `StrategySpec` once (`registerStrategy`) → hash-committed BEFORE
   any signal. That hash is the public commitment.
2. **Append** `Signal`s forward (`appendSignal`) → timestamped, chained, never
   editable.

The structure intentionally mirrors
[`anthropics/financial-services`](https://github.com/anthropics/financial-services):
file-based, no build step, deployable as Claude Cowork plugins **or** via the
Managed Agents API.

```
creators/
  .claude-plugin/marketplace.json   # registers the vertical plugins
  systematic-screener/              # vertical plugin  (archetype: systematic)
    .claude-plugin/plugin.json
    commands/screen.md
    skills/vcp-screen/SKILL.md
  fundamental-research/             # vertical plugin  (archetype: fundamental)
    .claude-plugin/plugin.json
    commands/thesis.md
    skills/earnings-thesis/SKILL.md
  multi-agent-desk/                 # managed-agent cookbook (archetype: multi-agent)
    agent.yaml                      # analyst debate -> trader -> risk
    subagents/*.yaml                # least-privilege: only the emitter writes
```

## The emit contract

A creator never writes to the scoreboard directly. It calls the ledger API in
`lib/ledger/ledger.ts`:

```ts
import { registerStrategy, appendSignal } from "@/lib/ledger/ledger";

await registerStrategy({ id, name, market, archetype, creator, thesis, params, createdAt });
await appendSignal({ strategyId: id, ts, action, symbol, meta });
```

`scripts/seed-ledger.ts` is a working reference: it plays all three archetypes
through this exact contract. Swapping the deterministic demo logic for real
agent execution (Managed Agents API) does not change the contract — the hash
chain travels with the data.

## Archetypes

| Creator | Archetype | Edge source | FSI analogue |
|---|---|---|---|
| systematic-screener | `systematic` | VCP/CANSLIM/PEAD screens + edge-pipeline anti-overfit gates | `financial-analysis` |
| fundamental-research | `fundamental` | Earnings thesis / drift, sector + catalyst research | `equity-research` |
| multi-agent-desk | `multi-agent` | Analyst debate → trader → risk (TradingAgents-style) | `earnings-reviewer` (subagent delegation) |
