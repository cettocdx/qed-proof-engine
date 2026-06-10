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
import type { Bot } from "@/lib/bots/roster";
import type { Bar } from "@/lib/market/data";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — enough for all 35 bots

const SECRET = process.env.CRON_SECRET;

// Use 1h bars for continuous intraday signals; 200 bars ≈ 8 days of hourly data
const INTRADAY_INTERVAL = "1h" as const;
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

  let bars: Bar[];
  try {
    bars = await getBars(bot.symbols[0], bot.source, INTRADAY_INTERVAL, INTRADAY_LIMIT);
  } catch (e) {
    return { id: bot.id, name: bot.name, signals: 0, note: `data: ${(e as Error).message}` };
  }
  if (bars.length < skill.lookback + 10) {
    return { id: bot.id, name: bot.name, signals: 0, note: "insufficient bars" };
  }

  await ensureSpec(bot, bars, knownIds);

  // Deduplicate: skip if already have a signal within the last hour
  const last = bars[bars.length - 1];
  const lastHour = new Date(last.t).toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
  const existing = await getSignals(bot.id);
  if (existing.some((s) => s.ts.slice(0, 13) === lastHour)) {
    return { id: bot.id, name: bot.name, signals: 0, note: "already emitted this hour" };
  }

  // ── Brain Pipeline ────────────────────────────────────────────────────
  const brainOpts = {
    skillId,
    skillParams: ctx.optimized[bot.id]?.skillId === skillId ? ctx.optimized[bot.id].params : null,
    coachModifier: ctx.coachNotes[bot.id]?.modifier ?? 1.0,
  };

  let decision;
  let layersSummary = "";

  if (useLlm) {
    // Full 4-layer pipeline (L1 ensemble + L2 memory + L3 panel + L4 veto)
    const result = await runBrainPipeline(bot, bars, existing, brainOpts);
    if (result) {
      decision = { action: result.action, confidence: result.confidence, rationale: result.rationale };
      const e = result.layers.ensemble;
      const v = result.layers.veto;
      layersSummary = `ens:${e.bullVotes}B/${e.bearVotes}S regime:${e.regime.regime} veto:${v?.verdict ?? "skip"}`;
    }
  } else {
    // Fast path: L1 ensemble + L2 memory only (no LLM cost)
    const result = runBrainFast(bot, bars, existing, brainOpts);
    if (result) {
      decision = result;
      layersSummary = "ens+mem";
    }
  }

  if (!decision) {
    return { id: bot.id, name: bot.name, signals: 0, note: "brain:no-consensus" };
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
    symbol: bot.symbols[0],
    meta: {
      price: +last.c.toFixed(2),
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
    symbol: bot.symbols[0],
    market: bot.market,
    source: bot.source,
    side,
    entryPrice: +last.c.toFixed(2),
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
    note: `${decision.action} conf=${decision.confidence.toFixed(2)} | ${paperNote}`,
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
