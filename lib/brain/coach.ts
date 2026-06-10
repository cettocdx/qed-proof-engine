import { promises as fs } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { Position } from "../positions/tracker";
import type { Bot } from "../bots/roster";

/**
 * LLM Trading Coach.
 *
 * Periodically reviews each bot's closed trades and writes a coaching note:
 * what's working, what's bleeding, and a confidence modifier (0.7–1.2) that
 * multiplies into the brain pipeline. A bot on a bad streak with a clear
 * pattern gets throttled; a bot executing well gets a small boost.
 */

const COACH_FILE = path.join(process.cwd(), "lib", "data", "coach-notes.json");

const CoachReview = z.object({
  lesson: z.string().max(400),
  pattern: z.string().max(200),
  modifier: z.number().min(0.7).max(1.2),
});
type CoachReview = z.infer<typeof CoachReview>;

export interface CoachNote {
  botId: string;
  lesson: string;
  pattern: string;
  modifier: number;
  tradesReviewed: number;
  coachedAt: string;
}

export type CoachNotes = Record<string, CoachNote>; // key = botId

export async function loadCoachNotes(): Promise<CoachNotes> {
  try {
    return JSON.parse(await fs.readFile(COACH_FILE, "utf8")) as CoachNotes;
  } catch {
    return {};
  }
}

export async function saveCoachNotes(notes: CoachNotes) {
  await fs.mkdir(path.dirname(COACH_FILE), { recursive: true });
  await fs.writeFile(COACH_FILE, JSON.stringify(notes, null, 2), "utf8");
}

export async function coachBot(bot: Bot, closed: Position[]): Promise<CoachNote | null> {
  if (!process.env.OPENAI_API_KEY || closed.length < 3) return null;

  const client = new OpenAI();
  const trades = closed.slice(-15).map((p) => ({
    side: p.side,
    entry: p.entryPrice,
    exit: p.exitPrice,
    pnlUsd: p.pnlUsd ?? 0,
    closeReason: p.closeReason,
    heldFrom: p.entryTs.slice(0, 10),
  }));

  const wins = trades.filter((t) => t.pnlUsd > 0).length;

  try {
    const res = await client.chat.completions.parse({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a veteran trading coach reviewing an algorithmic trader's closed trades. " +
            "Identify the strongest recurring pattern (good or bad), write one concrete lesson, " +
            "and set a confidence modifier: 0.7-0.9 if a losing pattern must be throttled, " +
            "1.0 if neutral, 1.05-1.2 if execution is strong and deserves more size.",
        },
        {
          role: "user",
          content:
            `Trader: ${bot.name} (${bot.profile.specialty}, ${bot.profile.riskLevel} risk)\n` +
            `Skill: ${bot.skill} on ${bot.symbols[0]}\n` +
            `Closed trades (last ${trades.length}, ${wins} wins):\n` +
            JSON.stringify(trades, null, 1),
        },
      ],
      response_format: zodResponseFormat(CoachReview, "review"),
    });

    const parsed = res.choices[0]?.message?.parsed;
    if (!parsed) return null;

    return {
      botId: bot.id,
      lesson: parsed.lesson,
      pattern: parsed.pattern,
      modifier: parsed.modifier,
      tradesReviewed: trades.length,
      coachedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
