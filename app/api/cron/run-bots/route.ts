import { NextResponse } from "next/server";
import { getBars } from "@/lib/market/data";
import { SKILLS } from "@/lib/strategy/skills";
import { registerStrategy, appendSignal, verifyChain, getSpecs, getSignals } from "@/lib/ledger/ledger";
import { runBrainPipeline, runBrainFast } from "@/lib/brain";
import { placePaperOrder } from "@/lib/execution/paper";
import { openPosition } from "@/lib/positions/tracker";
import { temperamentFor } from "@/lib/bots/temperament";
import { getWallet } from "@/lib/portfolio/wallet";
import { loadSkillOverrides, effectiveSkillId, type SkillOverrides } from "@/lib/brain/evolution";
import { loadOptimizedParams, type OptimizedParams } from "@/lib/brain/optimizer";
import { loadCoachNotes, type CoachNotes } from "@/lib/brain/coach";
import { ROSTER } from "@/lib/bots/roster";
import { getScanList } from "@/lib/market/universe";
import { getOpenPositions } from "@/lib/positions/tracker";
import type { Bot } from "@/lib/bots/roster";
import type { Bar } from "@/lib/market/data";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — enough for all 35 bots

const SECRET = process.env.CRON_SECRET;

// 15m bars for truly continuous trading; 200 bars ≈ 50 hours of context
const INTRADAY_INTERVAL = "15m" as const;
const INTRADAY_LIMIT    = 200;

type BotResult = {
  id: string;
  name: string;
  signals: number;
  note: string;
  layers?: string;
};

async function ensureSpec(bot: Bot, bars: Bar[], knownIds: Set<string>) {
  if (knownIds.has(bot.id)) return;
  const skill = SKILLS[bot.skill];
  const start = Math.max(skill?.lookback ?? 60, bars.length - 120);
  await registerStrategy({
    id: bot.id,
    name: bot.name,
    market: bot.market,
    archetype: bot.archetype,
    creator: bot.handle,
    thesis: `${bot.profile.tagline} Skill: ${skill?.label ?? bot.skill} — ${skill?.blurb ?? ""}`,
    params: { skill: bot.skill, symbols: bot.symbols, handle: bot.handle, profile: bot.profile },
    createdAt: new Date(bars[start].t).toISOString(),
  });
  knownIds.add(bot.id);
}

type BrainContext = {
  overrides: SkillOverrides;
  optimized: OptimizedParams;
  coachNotes: CoachNotes;
};

async function runBotLive(bot: Bot, knownIds: Set<string>, useLlm: boolean, ctx: BrainContext): Promise<BotResult> {
  const skillId = effectiveSkillId(bot, ctx.overrides);
  const skill = SKILLS[skillId];
  if (!skill) return { id: bot.id, name: bot.name, signals: 0, note: "unknown skill" };

  const existing = await getSignals(bot.id);
  const bucket = (ts: string) => ts.slice(0, 13); // one signal per (bot, symbol) per hour
  const nowBucket = bucket(new Date().toISOString());

  const brainOpts = {
    skillId,
    skillParams: ctx.optimized[bot.id]?.skillId === skillId ? ctx.optimized[bot.id].params : null,
    coachModifier: ctx.coachNotes[bot.id]?.modifier ?? 1.0,
  };

  // ── Universe scan: fast brain (L1+L2, free) on EVERY symbol ───────────
  // The bot is not married to one ticker — it hunts the best setup in its
  // whole market each run, then sends only the winner through the LLM layers.
  type Candidate = {
    symbol: string;
    bars: Bar[];
    action: "BUY" | "SELL" | "SHORT" | "COVER" | "FLAT";
    confidence: number;
    rationale: string;
  };
  const candidates: Candidate[] = [];
  let specEnsured = false;

  // Dynamic universe: home symbol + open-position symbols + this cycle's
  // rotating chunk of the full market (Binance USDT / NASDAQ / meme >$300k)
  const openSymbols = (await getOpenPositions())
    .filter((p) => p.strategyId === bot.id)
    .map((p) => p.symbol);
  const { scan, universeSize } = await getScanList(bot, openSymbols);

  for (const symbol of scan) {
    // one signal per (bot, symbol) per hour
    if (existing.some((s) => s.symbol === symbol && bucket(s.ts) === nowBucket)) continue;

    let bars: Bar[];
    try {
      bars = await getBars(symbol, bot.source, INTRADAY_INTERVAL, INTRADAY_LIMIT);
    } catch {
      continue;
    }
    if (bars.length < skill.lookback + 10) continue;

    if (!specEnsured) {
      await ensureSpec(bot, bars, knownIds);
      specEnsured = true;
    }

    const fast = runBrainFast(bot, bars, existing, brainOpts);
    if (fast) {
      candidates.push({ symbol, bars, ...fast });
    }
  }

  if (candidates.length === 0) {
    return { id: bot.id, name: bot.name, signals: 0, note: "scan:no-setup" };
  }

  // Best setup wins the bot's attention this run
  candidates.sort((a, b) => b.confidence - a.confidence);
  const pick = candidates[0];
  const bars = pick.bars;
  const last = bars[bars.length - 1];

  let decision;
  let layersSummary = `scan:${candidates.length}/${scan.length} (uni:${universeSize}) pick:${pick.symbol}`;

  if (useLlm) {
    // Full 4-layer pipeline only on the winning symbol (controls LLM cost)
    const result = await runBrainPipeline(bot, bars, existing, brainOpts);
    if (result) {
      decision = { action: result.action, confidence: result.confidence, rationale: result.rationale };
      const e = result.layers.ensemble;
      const v = result.layers.veto;
      layersSummary += ` ens:${e.bullVotes}B/${e.bearVotes}S regime:${e.regime.regime} veto:${v?.verdict ?? "skip"}`;
    }
  } else {
    decision = { action: pick.action, confidence: pick.confidence, rationale: pick.rationale };
  }

  if (!decision) {
    return { id: bot.id, name: bot.name, signals: 0, note: `brain:vetoed (${pick.symbol})` };
  }

  // ── Temperament gate + equity-based sizing ────────────────────────────
  const temperament = temperamentFor(bot);
  if (decision.confidence < temperament.minConfidence) {
    return {
      id: bot.id, name: bot.name, signals: 0,
      note: `temperament:${temperament.kind} skipped (conf ${decision.confidence.toFixed(2)} < ${temperament.minConfidence})`,
    };
  }

  const wallet = await getWallet(bot).catch(() => null);
  const equity = wallet?.equity ?? 100_000;
  if (equity <= 0) {
    return { id: bot.id, name: bot.name, signals: 0, note: "wallet:busted (equity <= 0)" };
  }
  const notional = Math.round(equity * temperament.riskPct);

  const signalTs = new Date().toISOString();
  const signal = {
    strategyId: bot.id,
    ts: signalTs,
    action: decision.action,
    symbol: pick.symbol,
    meta: {
      price: +last.c.toPrecision(8), // keep precision for sub-cent memecoins
      confidence: +decision.confidence.toFixed(2),
      rationale: decision.rationale,
      note: `brain:${useLlm ? "full" : "fast"} interval:${INTRADAY_INTERVAL} temperament:${temperament.kind} notional:${notional}`,
    },
  };

  await appendSignal(signal);

  // Paper execution
  const paperOrder = await placePaperOrder(signal, bot.market, notional).catch(() => null);

  // Position tracking
  const side = decision.action === "BUY" || decision.action === "COVER" ? "long" : "short";
  await openPosition({
    strategyId: bot.id,
    symbol: pick.symbol,
    market: bot.market,
    source: bot.source,
    side,
    entryPrice: +last.c.toPrecision(8),
    entryTs: signalTs,
    size: notional,
    atrBars: bars.slice(-20),
  }).catch(() => null);

  const paperNote = paperOrder
    ? `${paperOrder.venue}:${paperOrder.status}`
    : "paper:skip";

  return {
    id: bot.id,
    name: bot.name,
    signals: 1,
    note: `${decision.action} ${pick.symbol} conf=${decision.confidence.toFixed(2)} | ${paperNote}`,
    layers: layersSummary,
  };
}

export async function POST(req: Request) {
  if (SECRET) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${SECRET}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const useLlm = !!process.env.OPENAI_API_KEY;
  const known = new Set((await getSpecs()).map((s) => s.id));
  const results: BotResult[] = [];

  // Load brain context once per run (evolution overrides, optimized params, coach notes)
  const ctx: BrainContext = {
    overrides: await loadSkillOverrides(),
    optimized: await loadOptimizedParams(),
    coachNotes: await loadCoachNotes(),
  };

  for (const bot of ROSTER) {
    const r = await runBotLive(bot, known, useLlm, ctx);
    results.push(r);
  }

  const chain = await verifyChain();
  const emitted = results.filter((r) => r.signals > 0).length;

  return NextResponse.json({ ok: true, ts: new Date().toISOString(), emitted, chain, results });
}

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "use POST in production" }, { status: 405 });
  }
  return POST(req);
}
