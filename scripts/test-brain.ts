import { config } from "dotenv";
config({ path: ".env.local" });
import { getDailyBars } from "../lib/market/data";
import { runBrainPipeline } from "../lib/brain";
import { ROSTER } from "../lib/bots/roster";

async function main() {
  const bot = ROSTER[0]; // Atlas / BTC
  console.log(`Testing full brain pipeline on ${bot.name} (${bot.symbols[0]})\n`);

  const bars = await getDailyBars(bot.symbols[0], bot.source, 280);
  const result = await runBrainPipeline(bot, bars, []);

  if (!result) {
    console.log("Result: No signal — brain filtered out (no consensus or veto)");
    return;
  }

  console.log(`ACTION:     ${result.action}`);
  console.log(`CONFIDENCE: ${result.confidence.toFixed(2)}`);
  console.log(`RATIONALE:  ${result.rationale}\n`);

  const { ensemble, memory, panel, veto } = result.layers;

  console.log(`── L1 Ensemble ──────────────────────────`);
  console.log(`  Bull: ${ensemble.bullVotes}  Bear: ${ensemble.bearVotes}  Total voted: ${ensemble.totalVoted}`);
  console.log(`  Top votes:`);
  for (const v of ensemble.votes.slice(0, 5)) {
    console.log(`    ${v.skillId.padEnd(22)} ${v.action}  conf=${v.confidence.toFixed(2)}`);
  }

  console.log(`\n── L2 Memory ────────────────────────────`);
  console.log(`  Signals: ${memory.signalCount}  Win rate (recent): ${memory.recentWinRate !== null ? (memory.recentWinRate * 100).toFixed(0) + "%" : "—"}`);
  console.log(`  Consecutive losses: ${memory.consecutiveLosses}  wins: ${memory.consecutiveWins}`);
  console.log(`  Modifier: ${memory.modifier}  Status: ${memory.note}`);

  if (panel) {
    console.log(`\n── L3 Analyst Panel ─────────────────────`);
    console.log(`  Consensus: ${panel.consensus ?? "none"}  Agreement: ${(panel.agreementRatio * 100).toFixed(0)}%`);
    for (const v of panel.votes) {
      console.log(`  [${v.lens.padEnd(10)}] ${v.action}  conf=${v.confidence.toFixed(2)}`);
      console.log(`    "${v.reasoning.slice(0, 100)}"`);
    }
  } else {
    console.log(`\n── L3 Panel: skipped (no OPENAI_API_KEY or insufficient data)`);
  }

  if (veto) {
    console.log(`\n── L4 Risk Veto ─────────────────────────`);
    console.log(`  Verdict: ${veto.verdict}`);
    console.log(`  Key risk: ${veto.keyRisk}`);
    console.log(`  Rationale: ${veto.rationale.slice(0, 200)}`);
  }
}

main().catch(console.error);
