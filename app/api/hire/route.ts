import { NextResponse } from "next/server";
import { ROSTER } from "@/lib/bots/roster";
import { getAllWallets } from "@/lib/portfolio/wallet";
import { computeMetrics } from "@/lib/ledger/ledger";
import { temperamentFor, bioFor, hirePriceUsd } from "@/lib/bots/temperament";
import { loadSkillOverrides, effectiveSkillId } from "@/lib/brain/evolution";
import { loadCoachNotes } from "@/lib/brain/coach";
import { getCryptoUniverse, getMemeUniverse, getEquityUniverse } from "@/lib/market/universe";
import { SKILLS } from "@/lib/strategy/skills";
import { getAllEquityCurves } from "@/lib/portfolio/snapshots";

export const dynamic = "force-dynamic";

const MEME_IDS = new Set(["AGT-029", "AGT-030", "AGT-031", "AGT-032", "AGT-033", "AGT-034", "AGT-035"]);

export async function GET() {
  const [wallets, metrics, overrides, coachNotes, cryptoUni, memeUni, eqUni, hourlyCurves] = await Promise.all([
    getAllWallets(),
    computeMetrics(),
    loadSkillOverrides(),
    loadCoachNotes(),
    getCryptoUniverse().catch(() => []),
    getMemeUniverse().catch(() => []),
    getEquityUniverse().catch(() => []),
    getAllEquityCurves().catch(() => new Map<string, number[]>()),
  ]);

  const walletById = new Map(wallets.map((w) => [w.strategyId, w]));
  const metricsById = new Map(metrics.map((m) => [m.spec.id, m]));

  const cards = ROSTER.map((bot) => {
    const w = walletById.get(bot.id);
    const m = metricsById.get(bot.id);
    const pnlUsd = (w?.realizedPnl ?? 0) + (w?.unrealizedPnl ?? 0);
    const returnPct = w?.returnPct ?? 0;
    const skillId = effectiveSkillId(bot, overrides);
    const t = temperamentFor(bot);
    const universe = MEME_IDS.has(bot.id)
      ? { label: "meme micro-caps ($500k–$10M)", size: memeUni.length }
      : bot.market === "CRYPTO"
        ? { label: "Binance pairs", size: cryptoUni.length }
        : { label: "NASDAQ stocks", size: eqUni.length };

    return {
      id: bot.id,
      name: bot.name,
      handle: bot.handle,
      archetype: bot.archetype,
      homeSymbol: bot.symbols[0],
      temperament: { kind: t.kind, label: t.label, riskPct: t.riskPct, minConfidence: t.minConfidence, blurb: t.blurb },
      bio: bioFor(bot),
      universe,
      skillLabel: SKILLS[skillId]?.label ?? skillId,
      evolved: overrides[bot.id]
        ? { from: SKILLS[overrides[bot.id].prevSkill]?.label ?? overrides[bot.id].prevSkill, at: overrides[bot.id].evolvedAt }
        : null,
      coach: coachNotes[bot.id] ? { lesson: coachNotes[bot.id].lesson, modifier: coachNotes[bot.id].modifier } : null,
      equity: w?.equity ?? 100_000,
      pnlUsd: +pnlUsd.toFixed(2),
      returnPct,
      winRate: w?.winRate ?? null,
      openPositions: w?.openPositions ?? 0,
      closedPositions: w?.closedPositions ?? 0,
      price: hirePriceUsd(bot, { pnlUsd, returnPct }),
      // hourly real-equity snapshots (incl. open-position MTM) — matches the
      // EQUITY/PROFIT numbers; falls back to signal-based curve until 2+ snapshots exist
      curve: hourlyCurves.get(bot.id) ?? (m?.forwardCurve ?? [1, 1]).map((v) => +(v * 100_000).toFixed(0)),
      signalCount: m?.signalCount ?? 0,
    };
  }).sort((a, b) => b.price - a.price || b.equity - a.equity);

  return NextResponse.json({ ok: true, ts: new Date().toISOString(), cards });
}
