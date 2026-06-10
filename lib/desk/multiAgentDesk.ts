import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { Bar } from "../market/data";
import type { SkillResult } from "../strategy/skills";

/**
 * Multi-agent desk — gpt-4o structured output.
 *
 * Runs a four-lens analyst debate (fundamental / technical / news / sentiment)
 * → trader → risk review and returns a single structured decision.
 * Used by multi-agent archetype bots when OPENAI_API_KEY is present.
 */

const DeskDecision = z.object({
  action: z.enum(["BUY", "SELL", "SHORT", "COVER", "FLAT"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  bull_case: z.string(),
  bear_case: z.string(),
});

export type DeskDecision = z.infer<typeof DeskDecision>;

function sma(v: number[], n: number) {
  if (v.length < n) return NaN;
  return v.slice(-n).reduce((a, c) => a + c, 0) / n;
}

function rsi(v: number[], n = 14) {
  if (v.length < n + 1) return NaN;
  let g = 0, l = 0;
  for (let i = v.length - n; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    if (d >= 0) g += d; else l -= d;
  }
  if (l === 0) return 100;
  return 100 - 100 / (1 + g / n / (l / n));
}

function features(symbol: string, bars: Bar[]) {
  const c = bars.map((b) => b.c);
  const last = c[c.length - 1];
  const ret = (n: number) =>
    c.length > n ? +(((last - c[c.length - 1 - n]) / c[c.length - 1 - n]) * 100).toFixed(1) : null;
  const hi = Math.max(...bars.slice(-40).map((b) => b.h));
  const lo = Math.min(...bars.slice(-40).map((b) => b.l));
  return {
    symbol, price: +last.toFixed(2),
    ret_5d: ret(5), ret_20d: ret(20), ret_60d: ret(60),
    rsi_14: +rsi(c).toFixed(0),
    sma_20: +sma(c, 20).toFixed(2),
    sma_50: +sma(c, 50).toFixed(2),
    above_sma50: last > sma(c, 50),
    dist_from_40d_high_pct: +(((last - hi) / hi) * 100).toFixed(1),
    dist_from_40d_low_pct: +(((last - lo) / lo) * 100).toFixed(1),
  };
}

const SYSTEM = `You are a systematic trading desk. For the given instrument, run this internal process:

1. ANALYST DEBATE — four lenses on the real market features:
   - Technical (trend, momentum, RSI, MA structure)
   - Fundamental/flow (what price action implies about positioning)
   - News/macro (regime risk implied by the move)
   - Sentiment (crowded, exhausted, or early)
2. TRADER — synthesize into one action with 0..1 confidence.
3. RISK — veto over-extended or low-conviction trades; prefer FLAT when unresolved.

FLAT is valid and common. Confidence above 0.7 should be rare and well-justified.`;

export async function runDesk(symbol: string, bars: Bar[]): Promise<SkillResult | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  if (bars.length < 60) return null;

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const feat = features(symbol, bars);

  try {
    const res = await client.chat.completions.parse({
      model: "gpt-4o",
      max_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Instrument features (real daily data, no look-ahead):\n${JSON.stringify(feat, null, 2)}\n\nReturn the desk's decision.`,
        },
      ],
      response_format: zodResponseFormat(DeskDecision, "decision"),
    });

    const d = res.choices[0].message.parsed;
    if (!d) return null;

    return {
      action: d.action,
      confidence: d.confidence,
      rationale: `desk[gpt-4o]: ${d.rationale} | bull: ${d.bull_case} | bear: ${d.bear_case}`,
    };
  } catch (err) {
    console.error("[desk] error:", (err as Error).message);
    return null;
  }
}
