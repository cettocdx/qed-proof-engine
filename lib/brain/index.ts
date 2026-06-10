import type { Bar } from "../market/data";
import type { Signal, SignalAction } from "../ledger/schema";
import type { Bot } from "../bots/roster";
import { SKILLS } from "../strategy/skills";
import { runEnsemble, type EnsembleResult } from "./ensemble";
import { computeMemory, type MemoryResult } from "./memory";
import { runPanel, type PanelResult } from "./panel";
import { runRiskVeto, type VetoResult } from "./riskVeto";

/**
 * Combined Brain Pipeline — all four layers in sequence.
 *
 * L1 Ensemble  →  L2 Memory  →  L3 Panel  →  L4 Risk Veto
 *
 * The pipeline short-circuits early when possible:
 * - No ensemble consensus → return null (no signal)
 * - Memory modifier = 0 (bot paused) → return null
 * - Panel conflicts with ensemble → veto likely
 * - Risk veto → no signal emitted
 *
 * When ANTHROPIC_API_KEY is absent, L3+L4 are skipped and the result is the
 * memory-adjusted ensemble signal. The ledger contract is unchanged — every
 * layer's output is recorded in signal.meta for full auditability.
 */

export interface BrainResult {
  action: SignalAction;
  confidence: number;
  rationale: string;
  layers: {
    ensemble: EnsembleResult;
    memory: MemoryResult;
    panel: PanelResult | null;
    veto: VetoResult | null;
  };
}

export interface BrainOpts {
  /** Effective skill (evolution override may differ from roster). */
  skillId?: string;
  /** Walk-forward-optimized params for the effective skill. */
  skillParams?: Record<string, number> | null;
  /** LLM coach confidence modifier (0.7–1.2). */
  coachModifier?: number;
}

export async function runBrainPipeline(
  bot: Bot,
  bars: Bar[],
  priorSignals: Signal[],
  opts: BrainOpts = {},
): Promise<BrainResult | null> {
  const skillId = opts.skillId ?? bot.skill;

  // ── L1: Skill Ensemble (regime-weighted, optimized params) ──────────
  const ensemble = runEnsemble(bars, skillId, opts.skillParams);

  if (!ensemble.action) return null; // no consensus among skills

  // ── L2: Bot Memory ───────────────────────────────────────────────────
  const memory = computeMemory(priorSignals);

  if (memory.modifier === 0) {
    // Bot is paused — memory says don't trade
    return null;
  }

  // Apply memory + coach modifiers to ensemble confidence
  const coach = opts.coachModifier ?? 1.0;
  let confidence = Math.min(0.95, ensemble.confidence * memory.modifier * coach);

  // Skip LLM layers if no API key — return ensemble + memory result directly
  if (!process.env.OPENAI_API_KEY) {
    const rationale = buildRationale(ensemble, memory, null, null);
    return { action: ensemble.action, confidence, rationale, layers: { ensemble, memory, panel: null, veto: null } };
  }

  // ── L3: Analyst Panel (3 parallel Haiku calls) ───────────────────────
  const panel = await runPanel(bot.symbols[0], bars);

  // Panel is optional: if it failed or has no consensus, we still proceed
  // but the risk veto will see "panel unavailable" and be more conservative.
  if (panel && panel.consensus && panel.consensus !== ensemble.action) {
    // Panel and ensemble disagree — veto early, no point in risk call
    return null;
  }

  // Panel agreeing boosts confidence slightly; panel flat doesn't hurt it
  if (panel?.consensus === ensemble.action) {
    confidence = Math.min(0.95, confidence + 0.05 * panel.agreementRatio);
  }

  // ── L4: Risk Veto (1 Sonnet call) ────────────────────────────────────
  const veto = await runRiskVeto(ensemble.action, confidence, ensemble, memory, panel);

  if (!veto || veto.verdict === "VETO") return null;

  if (veto.verdict === "REDUCE" && veto.confidenceOverride !== null) {
    confidence = veto.confidenceOverride;
  }

  // Final confidence floor — don't emit very low-confidence signals
  if (confidence < 0.25) return null;

  const rationale = buildRationale(ensemble, memory, panel, veto);

  return {
    action: ensemble.action,
    confidence,
    rationale,
    layers: { ensemble, memory, panel, veto },
  };
}

// ── helpers ───────────────────────────────────────────────────────────────

function buildRationale(
  ensemble: EnsembleResult,
  memory: MemoryResult,
  panel: PanelResult | null,
  veto: VetoResult | null,
): string {
  const parts: string[] = [];

  parts.push(
    `ensemble:${ensemble.bullVotes}B/${ensemble.bearVotes}S/${ensemble.totalVoted - ensemble.bullVotes - ensemble.bearVotes}F`,
  );

  if (memory.modifier !== 1.0) {
    parts.push(`mem:${memory.note}`);
  }

  if (panel) {
    const panelStr = panel.votes.map((v) => `${v.lens[0]}:${v.action[0]}`).join(" ");
    parts.push(`panel:[${panelStr}]`);
  }

  if (veto) {
    parts.push(`veto:${veto.verdict}`);
    if (veto.keyRisk) parts.push(`risk:${veto.keyRisk.slice(0, 80)}`);
  }

  return parts.join(" | ");
}

/** Thin wrapper: runs only L1+L2 (no LLM cost) — used for backtesting / seeding. */
export function runBrainFast(
  bot: Bot,
  bars: Bar[],
  priorSignals: Signal[],
  opts: BrainOpts = {},
): { action: SignalAction; confidence: number; rationale: string } | null {
  const skillId = opts.skillId ?? bot.skill;
  const ensemble = runEnsemble(bars, skillId, opts.skillParams);
  if (!ensemble.action) return null;

  const memory = computeMemory(priorSignals);
  if (memory.modifier === 0) return null;

  const coach = opts.coachModifier ?? 1.0;
  const confidence = Math.min(0.95, ensemble.confidence * memory.modifier * coach);
  if (confidence < 0.2) return null;

  const skill = SKILLS[skillId];
  return {
    action: ensemble.action,
    confidence,
    rationale: `fast:${ensemble.bullVotes}B/${ensemble.bearVotes}S | regime:${ensemble.regime.regime} | mem:${memory.note} | skill:${skill?.label ?? skillId}`,
  };
}
