import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { Bar } from "../market/data";
import type { SignalAction } from "../ledger/schema";

/**
 * Layer 3 — Analyst Panel.
 *
 * Three parallel gpt-4o-mini calls — one per lens (Technical / Macro / Sentiment).
 * Each analyst sees real market features and returns a directional vote.
 * At least 2/3 must agree for the panel to produce a signal.
 */

const AnalystVote = z.object({
  action: z.enum(["BUY", "SELL", "FLAT"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(300),
});
type AnalystVote = z.infer<typeof AnalystVote>;

export interface PanelResult {
  votes: { lens: string; action: string; confidence: number; reasoning: string }[];
  consensus: SignalAction | null;
  agreementRatio: number;
  bullCount: number;
  bearCount: number;
  flatCount: number;
}

function buildFeatures(symbol: string, bars: Bar[]) {
  const c = bars.map((b) => b.c);
  const v = bars.map((b) => b.v);
  const last = c[c.length - 1];
  const sma = (n: number) =>
    c.length >= n ? c.slice(-n).reduce((a, x) => a + x, 0) / n : null;
  const ret = (n: number) =>
    c.length > n
      ? +((last - c[c.length - 1 - n]) / c[c.length - 1 - n] * 100).toFixed(1)
      : null;
  const avgVol = v.slice(-20).reduce((a, x) => a + x, 0) / 20;
  const hi40 = Math.max(...bars.slice(-40).map((b) => b.h));
  const lo40 = Math.min(...bars.slice(-40).map((b) => b.l));
  return {
    symbol,
    price: +last.toFixed(4),
    ret_1d: ret(1), ret_5d: ret(5), ret_20d: ret(20), ret_60d: ret(60),
    sma20: sma(20) ? +sma(20)!.toFixed(4) : null,
    sma50: sma(50) ? +sma(50)!.toFixed(4) : null,
    above_sma20: sma(20) !== null ? last > sma(20)! : null,
    above_sma50: sma(50) !== null ? last > sma(50)! : null,
    dist_from_40d_high_pct: +(((last - hi40) / hi40) * 100).toFixed(1),
    dist_from_40d_low_pct: +(((last - lo40) / lo40) * 100).toFixed(1),
    vol_ratio: avgVol > 0 ? +(v[v.length - 1] / avgVol).toFixed(2) : null,
  };
}

const ANALYSTS = [
  {
    lens: "technical",
    system:
      "You are the technical analyst on a trading desk. Analyze price action, moving average structure, momentum, and trend using ONLY the provided real daily market features. Return BUY (bullish), SELL (bearish), or FLAT (no conviction). Be concise. FLAT is correct when evidence is mixed.",
  },
  {
    lens: "macro",
    system:
      "You are the macro/flow analyst on a trading desk. Interpret what multi-timeframe price action implies about positioning and regime (risk-on vs risk-off). Use ONLY the provided features. Return BUY, SELL, or FLAT.",
  },
  {
    lens: "sentiment",
    system:
      "You are the sentiment analyst on a trading desk. Assess whether the current move is crowded, exhausted, or early — using volume ratio, distance from range extremes, and momentum. Return BUY, SELL, or FLAT.",
  },
];

export async function runPanel(symbol: string, bars: Bar[]): Promise<PanelResult | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  if (bars.length < 60) return null;

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const feat = buildFeatures(symbol, bars);
  const userMsg = `Market features (real daily data):\n${JSON.stringify(feat, null, 2)}\n\nReturn your vote.`;

  const tasks = ANALYSTS.map((analyst) =>
    client.chat.completions
      .parse({
        model: "gpt-4o-mini",
        max_tokens: 512,
        messages: [
          { role: "system", content: analyst.system },
          { role: "user", content: userMsg },
        ],
        response_format: zodResponseFormat(AnalystVote, "vote"),
      })
      .then((r: { choices: { message: { parsed: AnalystVote | null } }[] }) => ({
        lens: analyst.lens,
        vote: r.choices[0].message.parsed,
      }))
      .catch(() => ({ lens: analyst.lens, vote: null }))
  );

  const results = await Promise.all(tasks);

  const votes: PanelResult["votes"] = [];
  for (const { lens, vote } of results) {
    if (vote) {
      votes.push({
        lens,
        action: vote.action,
        confidence: vote.confidence,
        reasoning: vote.reasoning,
      });
    }
  }

  if (votes.length === 0) return null;

  const bullCount = votes.filter((v) => v.action === "BUY").length;
  const bearCount = votes.filter((v) => v.action === "SELL").length;
  const flatCount = votes.filter((v) => v.action === "FLAT").length;
  const total = votes.length;

  let consensus: SignalAction | null = null;
  let agreementRatio = 0;

  if (bullCount >= 2 && bullCount > bearCount) {
    consensus = "BUY";
    agreementRatio = bullCount / total;
  } else if (bearCount >= 2 && bearCount > bullCount) {
    consensus = "SELL";
    agreementRatio = bearCount / total;
  } else {
    agreementRatio = flatCount / total;
  }

  return { votes, consensus, agreementRatio, bullCount, bearCount, flatCount };
}
