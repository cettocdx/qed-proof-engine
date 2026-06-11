import { NextResponse } from "next/server";
import { getBars } from "@/lib/market/data";
import { ROSTER } from "@/lib/bots/roster";
import {
  loadSkillOverrides, saveSkillOverrides, effectiveSkillId, evolveBot,
} from "@/lib/brain/evolution";
import {
  loadOptimizedParams, saveOptimizedParams, optimizeSkill,
} from "@/lib/brain/optimizer";
import { loadCoachNotes, saveCoachNotes, coachBot } from "@/lib/brain/coach";
import { getAllPositions } from "@/lib/positions/tracker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Nightly evolution cycle — makes every bot better over time:
 *
 *  1. EVOLVE    — backtest all skills on each bot's symbol; reassign the skill
 *                 if the current one is clearly inferior.
 *  2. OPTIMIZE  — walk-forward grid-search the (possibly new) skill's params.
 *  3. COACH     — LLM reviews closed trades, writes a lesson + confidence modifier.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  // Fail closed: no CRON_SECRET configured → endpoint locked.
  if (!secret || (req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const overrides = await loadSkillOverrides();
  const optimized = await loadOptimizedParams();
  const coachNotes = await loadCoachNotes();
  const positions = await getAllPositions();

  const report: Record<string, unknown>[] = [];

  for (const bot of ROSTER) {
    const entry: Record<string, unknown> = { id: bot.id, name: bot.name };
    try {
      // Longer history for robust backtests: 500 hourly bars ≈ 3 weeks
      const bars = await getBars(bot.symbols[0], bot.source, "1h", 500);
      if (bars.length < 150) {
        entry.note = "insufficient bars";
        report.push(entry);
        continue;
      }

      // 1. Evolution
      const currentSkill = effectiveSkillId(bot, overrides);
      const evo = evolveBot(bot, currentSkill, bars);
      if (evo.evolved) {
        overrides[bot.id] = {
          skillId: evo.bestSkill,
          prevSkill: currentSkill,
          reason: `score ${evo.currentScore.toFixed(3)} → ${evo.bestScore.toFixed(3)}`,
          evolvedAt: new Date().toISOString(),
        };
        entry.evolved = `${currentSkill} → ${evo.bestSkill}`;
      } else {
        entry.skill = currentSkill;
      }

      // 2. Walk-forward optimization on the effective skill
      const skillNow = effectiveSkillId(bot, overrides);
      const opt = optimizeSkill(skillNow, bars);
      if (opt.testScore > -Infinity) {
        optimized[bot.id] = opt;
        entry.optimized = opt.params ? JSON.stringify(opt.params) : "defaults";
        entry.testScore = opt.testScore;
      }

      // 3. LLM coach (only when there's enough trade history)
      const closed = positions.filter((p) => p.strategyId === bot.id && p.status === "closed");
      const note = await coachBot(bot, closed);
      if (note) {
        coachNotes[bot.id] = note;
        entry.coach = `mod=${note.modifier} — ${note.pattern.slice(0, 60)}`;
      }
    } catch (e) {
      entry.error = (e as Error).message;
    }
    report.push(entry);
  }

  await saveSkillOverrides(overrides);
  await saveOptimizedParams(optimized);
  await saveCoachNotes(coachNotes);

  const evolvedCount = report.filter((r) => r.evolved).length;
  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
    evolved: evolvedCount,
    optimized: Object.keys(optimized).length,
    coached: Object.keys(coachNotes).length,
    report,
  });
}

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "use POST in production" }, { status: 405 });
  }
  return POST(req);
}
