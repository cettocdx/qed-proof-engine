import { promises as fs } from "node:fs";
import path from "node:path";
import { backtestSkill } from "../strategy/skillBacktest";
import { SKILL_IDS } from "../strategy/skills";
import type { Bar } from "../market/data";
import type { Bot } from "../bots/roster";

/**
 * Evolutionary skill pool.
 *
 * Every evolution cycle, all skills are backtested on each bot's symbol. If
 * the bot's current skill is clearly inferior (bottom 40% AND the best skill
 * scores at least 1.5× better), the bot's skill is reassigned. Overrides are
 * persisted — the roster file never changes, the override layer wins.
 */

const OVERRIDES_FILE = path.join(process.cwd(), "lib", "data", "skill-overrides.json");

export interface SkillOverride {
  skillId: string;
  reason: string;
  prevSkill: string;
  evolvedAt: string;
}

export type SkillOverrides = Record<string, SkillOverride>; // key = botId

export async function loadSkillOverrides(): Promise<SkillOverrides> {
  try {
    return JSON.parse(await fs.readFile(OVERRIDES_FILE, "utf8")) as SkillOverrides;
  } catch {
    return {};
  }
}

export async function saveSkillOverrides(data: SkillOverrides) {
  await fs.mkdir(path.dirname(OVERRIDES_FILE), { recursive: true });
  await fs.writeFile(OVERRIDES_FILE, JSON.stringify(data, null, 2), "utf8");
}

/** The skill a bot actually trades right now (override wins over roster). */
export function effectiveSkillId(bot: Bot, overrides: SkillOverrides): string {
  return overrides[bot.id]?.skillId ?? bot.skill;
}

export interface EvolutionDecision {
  botId: string;
  currentSkill: string;
  bestSkill: string;
  currentScore: number;
  bestScore: number;
  evolved: boolean;
  ranking: { skillId: string; score: number }[];
}

/**
 * Rank all skills on this bot's bars and decide whether to evolve.
 * Pure function — caller persists the override.
 */
export function evolveBot(bot: Bot, currentSkill: string, bars: Bar[]): EvolutionDecision {
  const ranking: { skillId: string; score: number }[] = [];

  for (const skillId of SKILL_IDS) {
    const r = backtestSkill(skillId, bars);
    if (r) ranking.push({ skillId, score: r.score });
  }
  ranking.sort((a, b) => b.score - a.score);

  const current = ranking.find((r) => r.skillId === currentSkill);
  const best = ranking[0];
  const currentScore = current?.score ?? -1;
  const bestScore = best?.score ?? 0;

  // Bottom-40% rule + clear superiority of the best
  const rank = ranking.findIndex((r) => r.skillId === currentSkill);
  const inBottom = rank === -1 || rank >= Math.ceil(ranking.length * 0.6);
  const clearlyBetter =
    bestScore > 0 && (currentScore <= 0 || bestScore >= currentScore * 1.5);

  const evolved = !!best && best.skillId !== currentSkill && inBottom && clearlyBetter;

  return {
    botId: bot.id,
    currentSkill,
    bestSkill: best?.skillId ?? currentSkill,
    currentScore,
    bestScore,
    evolved,
    ranking,
  };
}
