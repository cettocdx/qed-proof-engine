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
    createdAt: new Date().toISOString(), // real registration moment, not a historical bar
  });
  knownIds.add(bot.id);
}

type BrainContext = {
  overrides: SkillOverrides;
  optimized: OptimizedParams;
  coachNotes: CoachNotes;
};

// Max bots allowed in the same symbol simultaneously (meme tokens only)
const MAX_CONCURRENT_PER_MEME = 2;
const MEME_BOT_IDS = new Set(["AGT-029","AGT-030","AGT-031","AGT-032","AGT-033","AGT-034","AGT-035"]);

async function runBotLive(
  bot: Bot,
  knownIds: Set<string>,
  useLlm: boolean,
  ctx: BrainContext,
  openBySymbol: Map<string, number>,   // portfolio-wide open count per symbol
): Promise<BotResult> {
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

    // Liquidity filter for equities: no penny stocks, no dead volume.
    // Illiquid names produce untradeable "phantom" signals and absurd P&L.
    if (bot.market === "US-EQ") {
      const lastBar = bars[bars.length - 1];
      const recent = bars.slice(-20);
      const avgDollarVol = recent.reduce((a, b) => a + b.c * b.v, 0) / recent.length;
      if (lastBar.c < 5 || avgDollarVol < 2_000_000) continue;
    }

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

  // ── Portfolio drawdown circuit breaker ───────────────────────────────────
  // Drawdown is measured from the bot's LIFETIME PEAK equity (not the fixed
  // $100k stake — a bot that peaked at $150k and fell to $110k is down 26%).
  // On breach: flatten all open positions immediately, then halt new entries.
  const { getPeakEquity } = await import("@/lib/portfolio/snapshots");
  const peak = Math.max(await getPeakEquity(bot.id).catch(() => 100_000), 100_000);
  const drawdownPct = (equity - peak) / peak; // negative = below peak
  if (drawdownPct < -0.25) {
    const { closeAllForBot } = await import("@/lib/positions/tracker");
    const flattened = await closeAllForBot(bot.id, "manual").catch(() => []);
    // Audit trail: every forced exit must appear in the hash-chained ledger,
    // exactly like watcher auto-exits — otherwise the equity math and the
    // "tamper-proof record" claim silently diverge.
    for (const pos of flattened) {
      const exitAction = pos.side === "long" ? "SELL" : "COVER";
      await appendSignal({
        strategyId: pos.strategyId,
        ts: pos.exitTs ?? new Date().toISOString(),
        action: exitAction,
        symbol: pos.symbol,
        meta: {
          price: pos.exitPrice,
          confidence: 1.0,
          rationale: `forced exit: portfolio circuit breaker (dd ${(drawdownPct * 100).toFixed(1)}% from peak)`,
          note: `circuit-breaker:flatten pnl=${pos.pnlPct}%`,
        },
      }).catch((e) => console.error(`[run-bots] breaker exit signal failed for ${pos.symbol}:`, (e as Error).message));
    }
    return {
      id: bot.id, name: bot.name, signals: flattened.length,
      note: `circuit:breaker dd ${(drawdownPct * 100).toFixed(1)}% from peak $${Math.round(peak / 1000)}k — flattened ${flattened.length} position(s), entries halted`,
    };
  }

  // ── Realized-vol normalizer ──────────────────────────────────────────────
  // Scale position size inversely to recent volatility: quiet market → full
  // size; volatile market → reduced size. Uses 14-bar ATR% vs 100-bar median.
  let volScalar = 1.0;
  try {
    const recentBars = bars.slice(-100);
    if (recentBars.length >= 14) {
      const atrs: number[] = [];
      for (let i = 1; i < recentBars.length; i++) {
        const b = recentBars[i];
        const prev = recentBars[i - 1];
        const tr = Math.max(b.h - b.l, Math.abs(b.h - prev.c), Math.abs(b.l - prev.c));
        atrs.push(tr / prev.c); // ATR as % of price
      }
      const atr14 = atrs.slice(-14).reduce((a, b) => a + b, 0) / 14;
      const sortedAtrs = [...atrs].sort((a, b) => a - b);
      const medianAtr = sortedAtrs[Math.floor(sortedAtrs.length / 2)];
      const volRatio = medianAtr > 0 ? atr14 / medianAtr : 1;
      // Cap: never trade more than 1× normal, never less than 0.3×
      volScalar = Math.min(1.0, Math.max(0.3, 1 / volRatio));
    }
  } catch { /* bars unavailable — keep full size */ }

  const notional = Math.round(equity * temperament.riskPct * volScalar);

  // ── Meme correlation bucketing ────────────────────────────────────────────
  // Prevent the portfolio from piling into the same illiquid meme token.
  // Per-bot circuit breaker alone is not enough: 8 bots × $10k = $80k in
  // one micro-cap. Check the portfolio-wide open count for this symbol.
  if (MEME_BOT_IDS.has(bot.id)) {
    const action = decision.action;
    const isEntry = action === "BUY" || action === "SHORT";
    if (isEntry) {
      const currentCount = openBySymbol.get(pick.symbol) ?? 0;
      if (currentCount >= MAX_CONCURRENT_PER_MEME) {
        return {
          id: bot.id, name: bot.name, signals: 0,
          note: `meme:correlation-cap symbol:${pick.symbol} already ${currentCount}/${MAX_CONCURRENT_PER_MEME} bots open`,
        };
      }
      // Reserve the slot — subsequent bots in the same run see it
      openBySymbol.set(pick.symbol, currentCount + 1);
    }
  }

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
      note: `brain:${useLlm ? "full" : "fast"} interval:${INTRADAY_INTERVAL} temperament:${temperament.kind} notional:${notional} volscalar:${volScalar.toFixed(2)}`,
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
  // Fail closed: no CRON_SECRET configured → endpoint locked.
  if (!SECRET || req.headers.get("authorization") !== `Bearer ${SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  // Portfolio-wide open position count per symbol — shared across all bot runs
  // this cycle so meme correlation bucketing can see the full picture.
  const { getAllPositions } = await import("@/lib/positions/tracker");
  const allOpen = await getAllPositions().catch(() => []);
  const openBySymbol = new Map<string, number>();
  for (const p of allOpen.filter((p) => p.status === "open")) {
    openBySymbol.set(p.symbol, (openBySymbol.get(p.symbol) ?? 0) + 1);
  }

  for (const bot of ROSTER) {
    const r = await runBotLive(bot, known, useLlm, ctx, openBySymbol);
    results.push(r);
  }

  const chain = await verifyChain();
  const emitted = results.filter((r) => r.signals > 0).length;

  // Hourly equity snapshot — real equity (incl. open-position MTM) per bot,
  // so the hire/strategy charts always match the displayed numbers.
  try {
    const { getAllWallets } = await import("@/lib/portfolio/wallet");
    const { appendEquitySnapshot } = await import("@/lib/portfolio/snapshots");
    const wallets = await getAllWallets();
    await appendEquitySnapshot(Object.fromEntries(wallets.map((w) => [w.strategyId, +w.equity.toFixed(2)])));
  } catch (e) {
    console.error("[run-bots] equity snapshot failed:", (e as Error).message);
  }

  return NextResponse.json({ ok: true, ts: new Date().toISOString(), emitted, chain, results });
}

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "use POST in production" }, { status: 405 });
  }
  return POST(req);
}
