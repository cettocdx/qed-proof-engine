import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { SignalAction } from "../ledger/schema";
import type { EnsembleResult } from "./ensemble";
import type { MemoryResult } from "./memory";
import type { PanelResult } from "./panel";

/**
 * Layer 4 — Risk Veto (gpt-4o).
 *
 * Final gatekeeper. Sees ensemble vote, bot memory, and analyst panel.
 * Returns APPROVE, REDUCE (lower confidence), or VETO (no trade).
 */

const VetoDecision = z.object({
  verdict: z.enum(["APPROVE", "REDUCE", "VETO"]),
  confidence_override: z.number().min(0).max(1).nullable(),
  rationale: z.string().max(400),
  key_risk: z.string().max(200),
});

export interface VetoResult {
  verdict: "APPROVE" | "REDUCE" | "VETO";
  confidenceOverride: number | null;
  rationale: string;
  keyRisk: string;
}

const SYSTEM = `You are the Risk Manager on a systematic trading desk. Review a proposed trade and decide:

- APPROVE: signal is sound, proceed with proposed confidence
- REDUCE: signal has merit but risks warrant lower confidence (set confidence_override)
- VETO: do not trade — risk/reward is unfavorable or signals conflict

You receive: (1) ensemble vote from 8 quantitative skills, (2) bot memory with recent performance, (3) analyst panel opinions.

Be disciplined: prefer VETO when signals conflict or bot is on a losing streak. REDUCE for borderline cases. Set confidence_override only when verdict is REDUCE, otherwise null.`;

export async function runRiskVeto(
  action: SignalAction,
  confidence: number,
  ensemble: EnsembleResult,
  memory: MemoryResult,
  panel: PanelResult | null,
): Promise<VetoResult | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const context = {
    proposed: { action, confidence },
    ensemble: {
      consensus: ensemble.action,
      bullVotes: ensemble.bullVotes,
      bearVotes: ensemble.bearVotes,
      totalVoted: ensemble.totalVoted,
      agreementRatio: ensemble.totalVoted > 0
        ? (Math.max(ensemble.bullVotes, ensemble.bearVotes) / ensemble.totalVoted).toFixed(2)
        : "0",
    },
    memory: {
      signalCount: memory.signalCount,
      recentWinRate: memory.recentWinRate,
      consecutiveLosses: memory.consecutiveLosses,
      consecutiveWins: memory.consecutiveWins,
      inDrawdown: memory.inDrawdown,
      drawdownDepth: memory.drawdownDepth.toFixed(2),
      modifier: memory.modifier,
      status: memory.note,
    },
    panel: panel
      ? {
          consensus: panel.consensus,
          agreementRatio: panel.agreementRatio.toFixed(2),
          votes: panel.votes.map((v) => ({
            lens: v.lens,
            action: v.action,
            confidence: v.confidence.toFixed(2),
            reasoning: v.reasoning,
          })),
        }
      : "panel unavailable",
  };

  try {
    const res = await client.chat.completions.parse({
      model: "gpt-4o",
      max_tokens: 768,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Trade context:\n${JSON.stringify(context, null, 2)}\n\nReturn your risk decision.`,
        },
      ],
      response_format: zodResponseFormat(VetoDecision, "decision"),
    });

    const d = res.choices[0].message.parsed;
    if (!d) return null;

    return {
      verdict: d.verdict,
      confidenceOverride: d.confidence_override,
      rationale: d.rationale,
      keyRisk: d.key_risk,
    };
  } catch (err) {
    console.error("[risk-veto] error:", (err as Error).message);
    return null;
  }
}
