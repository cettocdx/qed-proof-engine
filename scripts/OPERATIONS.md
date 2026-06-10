# Operations — running the bots

## One-off / demo (wipes and rebuilds the ledger from a look-ahead-free replay)

```sh
npm run bots:run            # all 28 bots, real Binance + Yahoo data
npm run bots:run:crypto     # only Binance bots (always reachable)
npm run bots:run:llm        # multi-agent bots use the real Opus 4.8 desk (needs ANTHROPIC_API_KEY)
npm run ledger:verify       # re-derive the hash chain from genesis
```

## Live-forward (append-only, the real track record)

`bots:live` does NOT wipe history. For each bot it computes today's decision on
the latest real bar and appends at most one NEW signal (deduped against the bot's
last action). Run it once per day to accrue a genuine forward record.

```sh
npm run bots:live
```

### Schedule it (macOS / Linux cron)

Run every weekday at 16:10 (after the US close). Adjust the path/node version.

```cron
10 16 * * 1-5  cd /Users/cetto/Developer/agentic && /usr/bin/env npm run bots:live >> /tmp/agentic-bots.log 2>&1
```

Crypto trades 24/7 — for crypto-only live signals you can run more often:

```cron
0 */6 * * *    cd /Users/cetto/Developer/agentic && /usr/bin/env npm run bots:live -- --crypto >> /tmp/agentic-bots.log 2>&1
```

For real LLM desks on the daily run, set `ANTHROPIC_API_KEY` in the cron env and
append `--llm`.

> Honesty note: the one-off `bots:run` seeds a transparent, look-ahead-free replay
> on real prices so the scoreboard isn't empty. `bots:live` is the true
> forward path — each day adds only what actually happened next. Neither places
> real orders; that's the paper-execution adapter (`lib/execution/paper.ts`).
