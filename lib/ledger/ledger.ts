import { promises as fs } from "node:fs";
import path from "node:path";
import { canonical, entryHash } from "./hash";
import { backtestPortfolio } from "../strategy/backtest";
import {
  GENESIS_HASH,
  type LedgerEntry,
  type LedgerPayload,
  type Signal,
  type SignalRecord,
  type StrategySpec,
  type StrategyMetrics,
  type StrategyDetail,
} from "./schema";

/**
 * Append-only, hash-chained ledger backed by a JSONL file (one entry per line).
 * File-based on purpose: mirrors the FSI "no build, inspectable artifacts"
 * ethos and is trivially auditable. Swap the storage adapter for Convex/Postgres
 * later without changing the contract — the hash chain travels with the data.
 */

const DATA_DIR = path.join(process.cwd(), "lib", "data");
const LEDGER_PATH = path.join(DATA_DIR, "ledger.jsonl");

async function readEntries(): Promise<LedgerEntry[]> {
  try {
    const raw = await fs.readFile(LEDGER_PATH, "utf8");
    const entries: LedgerEntry[] = [];
    for (const line of raw.split("\n")) {
      if (line.trim().length === 0) continue;
      try {
        entries.push(JSON.parse(line) as LedgerEntry);
      } catch {
        console.warn("[ledger] skipping corrupt line:", line.slice(0, 60));
      }
    }
    return entries;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function appendEntry(payload: LedgerPayload): Promise<LedgerEntry> {
  const entries = await readEntries();
  const prev = entries[entries.length - 1];
  const seq = prev ? prev.seq + 1 : 0;
  const prevHash = prev ? prev.hash : GENESIS_HASH;
  const ts = new Date().toISOString();
  const hash = entryHash({
    seq,
    ts,
    prevHash,
    payloadCanonical: canonical(payload),
  });
  const entry: LedgerEntry = { seq, ts, prevHash, hash, payload };

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.appendFile(LEDGER_PATH, JSON.stringify(entry) + "\n", "utf8");
  return entry;
}

/** Commit a strategy spec. Returns the committing entry (its hash = the proof). */
export async function registerStrategy(
  spec: StrategySpec,
): Promise<LedgerEntry> {
  return appendEntry({ kind: "spec", data: spec });
}

/** Append a forward signal. Order and timestamp are now permanent. */
export async function appendSignal(signal: Signal): Promise<LedgerEntry> {
  return appendEntry({ kind: "signal", data: signal });
}

/**
 * Re-derive every hash from genesis and confirm the chain is intact.
 * Returns the first broken seq, or null if the whole chain verifies.
 */
export async function verifyChain(): Promise<{ ok: boolean; brokenAt: number | null }> {
  const entries = await readEntries();
  let prevHash = GENESIS_HASH;
  for (const e of entries) {
    const expected = entryHash({
      seq: e.seq,
      ts: e.ts,
      prevHash,
      payloadCanonical: canonical(e.payload),
    });
    if (expected !== e.hash || e.prevHash !== prevHash) {
      return { ok: false, brokenAt: e.seq };
    }
    prevHash = e.hash;
  }
  return { ok: true, brokenAt: null };
}

export async function getSpecs(): Promise<StrategySpec[]> {
  const entries = await readEntries();
  // The chain is append-only, so a re-registered strategy appears twice —
  // dedupe by id (first registration wins) without touching the ledger.
  const seen = new Set<string>();
  const specs: StrategySpec[] = [];
  for (const e of entries) {
    if (e.payload.kind !== "spec") continue;
    const spec = (e.payload as { data: StrategySpec }).data;
    if (seen.has(spec.id)) continue;
    seen.add(spec.id);
    specs.push(spec);
  }
  return specs;
}

export async function getSignals(strategyId?: string): Promise<Signal[]> {
  const entries = await readEntries();
  const sigs = entries
    .filter((e) => e.payload.kind === "signal")
    .map((e) => (e.payload as { data: Signal }).data);
  return strategyId ? sigs.filter((s) => s.strategyId === strategyId) : sigs;
}

/**
 * Forward metrics, computed live from the ledger (never persisted, so they can
 * never be cherry-picked). The equity curve is a simple cumulative model over
 * signal confidence — a placeholder until real fills are attached, but it is
 * derived only from committed, forward data.
 */
export async function computeMetrics(): Promise<StrategyMetrics[]> {
  const specs = await getSpecs();
  const out: StrategyMetrics[] = [];

  for (const spec of specs) {
    const sigs = (await getSignals(spec.id)).sort((a, b) =>
      a.ts.localeCompare(b.ts),
    );
    // LIVE clock starts at the FIRST COMMITTED SIGNAL — derived from the
    // chain itself, identical rules for every agent. (spec.createdAt is a
    // chart anchor and varies with bar resolution.)
    const firstTs = sigs[0]?.ts ?? spec.createdAt;
    const liveDays = Math.max(
      0,
      Math.round((Date.now() - new Date(firstTs).getTime()) / 86_400_000),
    );

    out.push(metricsFor(spec, sigs, liveDays));
  }

  // live first, then incubating, then backtest-only; within a tier, best return first
  const rank = { LIVE: 0, INCUB: 1, BACKTEST: 2 } as const;
  return out.sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      (b.totalReturnPct ?? -Infinity) - (a.totalReturnPct ?? -Infinity),
  );
}

/** Shared forward-metric computation: a real P&L backtest over committed signals. */
function metricsFor(
  spec: StrategySpec,
  sigs: Signal[],
  liveDays: number,
): StrategyMetrics {
  const bt = backtestPortfolio(sigs);
  const enough = sigs.length >= 2;

  const status: StrategyMetrics["status"] =
    sigs.length === 0 ? "BACKTEST" : liveDays >= 7 ? "LIVE" : "INCUB";

  return {
    spec,
    liveDays,
    signalCount: sigs.length,
    totalReturnPct: enough ? bt.totalReturnPct : null,
    sharpe: bt.segments >= 4 ? bt.sharpe : null, // needs a meaningful sample
    winRatePct: enough ? bt.winRatePct : null,
    exposurePct: enough ? bt.exposurePct : null,
    maxDrawdownPct: bt.maxDrawdownPct,
    forwardCurve: bt.curve.length > 1 ? bt.curve : [1, 1],
    status,
  };
}

/** Full dossier for one strategy: spec, commitment hash, immutable signal log. */
export async function getStrategyDetail(
  id: string,
): Promise<StrategyDetail | null> {
  const entries = await readEntries();

  const commitEntry = entries.find(
    (e) => e.payload.kind === "spec" && e.payload.data.id === id,
  );
  if (!commitEntry || commitEntry.payload.kind !== "spec") return null;
  const spec = commitEntry.payload.data;

  const signals: SignalRecord[] = entries
    .filter(
      (e) => e.payload.kind === "signal" && e.payload.data.strategyId === id,
    )
    .map((e) => ({
      seq: e.seq,
      ts: e.ts,
      hash: e.hash,
      prevHash: e.prevHash,
      signal: (e.payload as { data: Signal }).data,
    }))
    .sort((a, b) => a.signal.ts.localeCompare(b.signal.ts));

  const firstTs = signals[0]?.signal.ts ?? spec.createdAt;
  const liveDays = Math.max(
    0,
    Math.round((Date.now() - new Date(firstTs).getTime()) / 86_400_000),
  );

  return {
    metrics: metricsFor(
      spec,
      signals.map((s) => s.signal),
      liveDays,
    ),
    commit: {
      seq: commitEntry.seq,
      ts: commitEntry.ts,
      hash: commitEntry.hash,
      prevHash: commitEntry.prevHash,
    },
    signals,
    chain: await verifyChain(),
  };
}

export const LEDGER_FILE = LEDGER_PATH;
