import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * 5-minute equity snapshots — real account equity (cash + open positions
 * marked to market) per bot, appended by the scheduler every 5 minutes.
 * This is what the hire-card / strategy charts plot, so the curve always
 * matches the EQUITY/PROFIT numbers shown next to it and moves with the
 * bot's live open trades.
 */

const SNAP_FILE = path.join(process.cwd(), "lib", "data", "equity-snapshots.jsonl");
const PEAKS_FILE = path.join(process.cwd(), "lib", "data", "equity-peaks.json");

export type EquitySnapshot = {
  ts: string;
  equities: Record<string, number>; // strategyId -> equity USD
};

/** Append one snapshot row covering all bots. Dedupes within 4 min. */
export async function appendEquitySnapshot(equities: Record<string, number>): Promise<void> {
  try {
    const last = await lastSnapshot();
    if (last && Date.now() - new Date(last.ts).getTime() < 4 * 60 * 1000) return;
    const entry: EquitySnapshot = { ts: new Date().toISOString(), equities };
    await fs.mkdir(path.dirname(SNAP_FILE), { recursive: true });
    await fs.appendFile(SNAP_FILE, JSON.stringify(entry) + "\n", "utf8");
    await updatePeaks(equities);
  } catch (e) {
    console.error("[snapshots] append failed:", (e as Error).message);
  }
}

/** Persist lifetime peaks separately so snapshot retention can never erase them. */
async function updatePeaks(equities: Record<string, number>): Promise<void> {
  try {
    let peaks: Record<string, number> = {};
    try { peaks = JSON.parse(await fs.readFile(PEAKS_FILE, "utf8")) as Record<string, number>; } catch { /* first run */ }
    let changed = false;
    for (const [id, eq] of Object.entries(equities)) {
      if (typeof eq === "number" && eq > (peaks[id] ?? 0)) { peaks[id] = eq; changed = true; }
    }
    if (changed) await fs.writeFile(PEAKS_FILE, JSON.stringify(peaks), "utf8");
  } catch { /* non-fatal */ }
}

async function readAll(): Promise<EquitySnapshot[]> {
  try {
    const raw = await fs.readFile(SNAP_FILE, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l) as EquitySnapshot; } catch { return null; }
      })
      .filter((s): s is EquitySnapshot => s !== null);
  } catch {
    return [];
  }
}

async function lastSnapshot(): Promise<EquitySnapshot | null> {
  const all = await readAll();
  return all[all.length - 1] ?? null;
}

/**
 * 5-minute equity curve for one bot (last `maxPoints` snapshots — 288 ≈ 24h).
 * Returns [] when fewer than 2 snapshots exist — caller falls back
 * to the signal-based curve.
 */
export async function getEquityCurve(strategyId: string, maxPoints = 288): Promise<number[]> {
  const all = await readAll();
  const pts = all
    .map((s) => s.equities[strategyId])
    .filter((v): v is number => typeof v === "number");
  return pts.length >= 2 ? pts.slice(-maxPoints) : [];
}

/**
 * Lifetime peak equity for one bot, derived from snapshots.
 * Never below STARTING_CAPITAL so a bot that only ever lost is measured
 * against its $100k stake.
 */
export async function getPeakEquity(strategyId: string): Promise<number> {
  let peak = 100_000;
  // Durable peaks file first (survives snapshot retention)
  try {
    const peaks = JSON.parse(await fs.readFile(PEAKS_FILE, "utf8")) as Record<string, number>;
    if (typeof peaks[strategyId] === "number" && peaks[strategyId] > peak) peak = peaks[strategyId];
  } catch { /* no peaks file yet */ }
  const all = await readAll();
  for (const snap of all) {
    const v = snap.equities[strategyId];
    if (typeof v === "number" && v > peak) peak = v;
  }
  return peak;
}

/** Curves for all bots at once (used by /api/hire). */
export async function getAllEquityCurves(maxPoints = 288): Promise<Map<string, number[]>> {
  const all = await readAll();
  const map = new Map<string, number[]>();
  for (const snap of all) {
    for (const [id, eq] of Object.entries(snap.equities)) {
      if (typeof eq !== "number") continue;
      const arr = map.get(id) ?? [];
      arr.push(eq);
      map.set(id, arr);
    }
  }
  for (const [id, arr] of map) {
    if (arr.length < 2) map.delete(id);
    else map.set(id, arr.slice(-maxPoints));
  }
  return map;
}
