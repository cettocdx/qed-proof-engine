import { config } from "dotenv";
config({ path: ".env.local" });
/**
 * Run the bot roster against REAL market data and emit signals into the ledger.
 *
 *   npx tsx scripts/run-bots.ts            # all bots
 *   npx tsx scripts/run-bots.ts --crypto   # only Binance bots (verified real)
 *
 * Honesty notes:
 *  - Prices are REAL (Binance public klines / Yahoo chart API).
 *  - Each signal is the output of the bot's assigned deterministic skill, with
 *    NO look-ahead: the decision at bar i sees only bars[0..i].
 *  - This bootstraps each track record from a transparent, re-derivable replay
 *    on real data. From here, running this daily appends true live-forward
 *    signals. It is NOT live order execution.
 */
import { promises as fs } from "node:fs";
import {
  registerStrategy,
  appendSignal,
  verifyChain,
  computeMetrics,
  getSpecs,
  getSignals,
  LEDGER_FILE,
} from "../lib/ledger/ledger";
import { getDailyBars } from "../lib/market/data";
import { SKILLS } from "../lib/strategy/skills";
import { runDesk } from "../lib/desk/multiAgentDesk";
import { placePaperOrder } from "../lib/execution/paper";
import { ROSTER, type Bot } from "../lib/bots/roster";

const REPLAY_BARS = 120; // ~6 months of trading days

const cryptoOnly = process.argv.includes("--crypto");
const useLlm = process.argv.includes("--llm"); // real LLM desks for multi-agent bots
const liveMode = process.argv.includes("--live"); // append today's decision, don't wipe
const usePaper = process.argv.includes("--paper"); // also place paper orders on new signals

async function runBot(bot: Bot): Promise<{ ok: boolean; signals: number; note?: string }> {
  const skill = SKILLS[bot.skill];
  if (!skill) return { ok: false, signals: 0, note: "unknown skill" };

  let bars;
  try {
    bars = await getDailyBars(bot.symbols[0], bot.source, 280);
  } catch (e) {
    return { ok: false, signals: 0, note: `data: ${(e as Error).message}` };
  }
  if (bars.length < skill.lookback + 10) {
    return { ok: false, signals: 0, note: "insufficient bars" };
  }

  const start = Math.max(skill.lookback, bars.length - REPLAY_BARS);
  const createdAt = new Date(bars[start].t).toISOString();

  await registerStrategy({
    id: bot.id,
    name: bot.name,
    market: bot.market,
    archetype: bot.archetype,
    creator: bot.handle,
    thesis: `${bot.profile.tagline} Skill: ${skill.label} — ${skill.blurb}`,
    params: {
      skill: bot.skill,
      symbols: bot.symbols,
      handle: bot.handle,
      profile: bot.profile,
    },
    createdAt,
  });

  // Real LLM desk for multi-agent bots (when --llm and a key are present):
  // emit a single, genuine forward decision for the latest real bar.
  if (useLlm && bot.archetype === "multi-agent") {
    const d = await runDesk(bot.symbols[0], bars);
    if (d && d.action !== "FLAT") {
      const last = bars[bars.length - 1];
      await appendSignal({
        strategyId: bot.id,
        ts: new Date(last.t).toISOString(),
        action: d.action,
        symbol: bot.symbols[0],
        meta: {
          price: +last.c.toFixed(2),
          confidence: +d.confidence.toFixed(2),
          rationale: d.rationale,
          note: "llm-desk:opus-4-8:live-decision",
        },
      });
      return { ok: true, signals: 1, note: "llm-desk" };
    }
    // desk returned null (no key / error / FLAT) -> fall back to skill replay below
  }

  // look-ahead-free replay: decision at bar i uses only bars[0..i]
  let emitted = 0;
  let lastAction: string | null = null;
  for (let i = start; i < bars.length; i++) {
    const window = bars.slice(0, i + 1);
    const r = skill.evaluate(window, bot.params);
    if (!r || r.action === "FLAT") continue;
    if (r.action === lastAction) continue; // dedup consecutive same-direction
    lastAction = r.action;
    await appendSignal({
      strategyId: bot.id,
      ts: new Date(bars[i].t).toISOString(),
      action: r.action,
      symbol: bot.symbols[0],
      meta: {
        price: +bars[i].c.toFixed(2),
        confidence: +r.confidence.toFixed(2),
        rationale: r.rationale,
        note: "replay:real-data:no-lookahead",
      },
    });
    emitted++;
  }
  return { ok: true, signals: emitted };
}

/**
 * Live-forward mode: append at most one NEW signal per bot for the latest real
 * bar, without wiping history. Registers a bot's spec the first time it's seen.
 * Dedupes against the bot's last emitted action so repeated runs don't spam.
 * Run daily via cron to accrue a true live-forward track record.
 */
async function runBotLive(
  bot: Bot,
  known: Set<string>,
): Promise<{ ok: boolean; signals: number; note?: string }> {
  const skill = SKILLS[bot.skill];
  if (!skill) return { ok: false, signals: 0, note: "unknown skill" };

  let bars;
  try {
    bars = await getDailyBars(bot.symbols[0], bot.source, 280);
  } catch (e) {
    return { ok: false, signals: 0, note: `data: ${(e as Error).message}` };
  }
  if (bars.length < skill.lookback + 5) {
    return { ok: false, signals: 0, note: "insufficient bars" };
  }

  if (!known.has(bot.id)) {
    await registerStrategy({
      id: bot.id,
      name: bot.name,
      market: bot.market,
      archetype: bot.archetype,
      creator: bot.handle,
      thesis: `${bot.profile.tagline} Skill: ${skill.label} — ${skill.blurb}`,
      params: { skill: bot.skill, symbols: bot.symbols, handle: bot.handle, profile: bot.profile },
      createdAt: new Date().toISOString(),
    });
  }

  // today's decision: real LLM desk for multi-agent (if --llm), else the skill
  let decision =
    useLlm && bot.archetype === "multi-agent"
      ? await runDesk(bot.symbols[0], bars)
      : null;
  if (!decision) decision = skill.evaluate(bars, bot.params);
  if (!decision || decision.action === "FLAT") {
    return { ok: true, signals: 0, note: "no signal today" };
  }

  // dedupe: skip if same direction as the last emitted signal
  const prior = (await getSignals(bot.id)).sort((a, b) => a.ts.localeCompare(b.ts));
  const lastAction = prior.length ? prior[prior.length - 1].action : null;
  if (decision.action === lastAction) {
    return { ok: true, signals: 0, note: "unchanged" };
  }

  const last = bars[bars.length - 1];
  const signal = {
    strategyId: bot.id,
    ts: new Date().toISOString(), // forward — emission time is now
    action: decision.action,
    symbol: bot.symbols[0],
    meta: {
      price: +last.c.toFixed(2),
      confidence: +decision.confidence.toFixed(2),
      rationale: decision.rationale,
      note: "live-forward",
    },
  };
  await appendSignal(signal);

  let note = decision.action as string;
  if (usePaper) {
    const order = await placePaperOrder(signal, bot.market);
    if (order) note += ` · paper:${order.venue}/${order.status}`;
  }
  return { ok: true, signals: 1, note };
}

async function main() {
  if (liveMode) {
    const known = new Set((await getSpecs()).map((s) => s.id));
    const bots = cryptoOnly ? ROSTER.filter((b) => b.source === "binance") : ROSTER;
    process.stdout.write(`[live] checking ${bots.length} bots for new signals…\n`);
    let emitted = 0;
    for (const bot of bots) {
      const res = await runBotLive(bot, known);
      if (res.signals > 0) {
        emitted++;
        process.stdout.write(`  + ${bot.id} ${bot.name} → ${res.note}\n`);
      }
    }
    const chain = await verifyChain();
    process.stdout.write(
      `[live] ${emitted} new signals | chain ${chain.ok ? "OK" : "BROKEN"}\n`,
    );
    return;
  }

  await fs.rm(LEDGER_FILE, { force: true });

  const bots = cryptoOnly ? ROSTER.filter((b) => b.source === "binance") : ROSTER;
  process.stdout.write(`running ${bots.length} bots on real data…\n\n`);

  let ok = 0;
  let failed = 0;
  for (const bot of bots) {
    const res = await runBot(bot);
    if (res.ok) {
      ok++;
      process.stdout.write(
        `  ✓ ${bot.id} ${bot.name.padEnd(14)} ${bot.symbols[0].padEnd(9)} ${String(res.signals).padStart(2)} sig\n`,
      );
    } else {
      failed++;
      process.stdout.write(
        `  ✗ ${bot.id} ${bot.name.padEnd(14)} ${bot.symbols[0].padEnd(9)} — ${res.note}\n`,
      );
    }
  }

  const chain = await verifyChain();
  const metrics = await computeMetrics();
  process.stdout.write(
    `\nchain: ${chain.ok ? "OK" : `BROKEN @ ${chain.brokenAt}`} | ok ${ok} | failed ${failed}\n`,
  );
  const live = metrics.filter((m) => m.status === "LIVE").length;
  const incub = metrics.filter((m) => m.status === "INCUB").length;
  const bt = metrics.filter((m) => m.status === "BACKTEST").length;
  process.stdout.write(`strategies: ${metrics.length} (LIVE ${live} · INCUB ${incub} · BACKTEST ${bt})\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
