/**
 * Proof-engine data contract.
 *
 * Two record kinds flow through the immutable ledger:
 *   1. A `StrategySpec` is registered once, BEFORE any signal — its hash is the
 *      commitment. Editing the spec later breaks the chain (that is the point).
 *   2. `Signal`s are appended forward, each timestamped, each chained to the
 *      previous entry. There is no "edit" or "delete" — only append.
 *
 * Creators (systematic / multi-agent / fundamental) all emit these same two
 * shapes, so the scoreboard can rank any archetype on equal, verifiable terms.
 */

export type Market = "US-EQ" | "CRYPTO" | "POLYMARKET" | "FX" | "FUTURES";

export type Archetype = "systematic" | "multi-agent" | "fundamental";

export type SignalAction = "BUY" | "SELL" | "SHORT" | "COVER" | "FLAT";

/** Registered once. The canonical hash of this object is the commitment. */
export interface StrategySpec {
  id: string; // e.g. "AGT-014" — stable public id
  name: string; // "VCP Continuation"
  market: Market;
  archetype: Archetype;
  creator: string; // which creator agent produced it, e.g. "systematic-screener"
  thesis: string; // one-paragraph human-readable edge thesis
  /** Free-form, creator-specific parameters (entry/exit rules, screen, etc). */
  params: Record<string, unknown>;
  /** ISO 8601. The moment the spec was committed — before its first signal. */
  createdAt: string;
}

/** Appended forward, one per emitted trading decision. */
export interface Signal {
  strategyId: string; // FK -> StrategySpec.id
  ts: string; // ISO 8601 emission time
  action: SignalAction;
  symbol: string; // "AAPL", "BTC-USD", market question id, etc.
  /** Optional realized outcome attached later (also append-only, never edit). */
  meta?: {
    price?: number; // reference price at emission
    confidence?: number; // 0..1
    note?: string;
    rationale?: string;
  };
}

/** Discriminated payload carried inside a LedgerEntry. */
export type LedgerPayload =
  | { kind: "spec"; data: StrategySpec }
  | { kind: "signal"; data: Signal };

/**
 * One immutable link in the chain. `hash = sha256(prevHash + canonical(payload) + ts + seq)`.
 * `prevHash` of the first entry is the genesis constant (all zeros).
 */
export interface LedgerEntry {
  seq: number; // monotonic, starts at 0
  ts: string; // ISO 8601 — when the entry was written
  prevHash: string; // hash of entry seq-1 (or GENESIS_HASH for seq 0)
  hash: string; // tamper-evident hash of this entry
  payload: LedgerPayload;
}

/** Per-strategy forward metrics computed from the ledger (never stored). */
export interface StrategyMetrics {
  spec: StrategySpec;
  liveDays: number; // days since spec commit
  signalCount: number;
  /** Real backtest stats from the committed signals' real prices. */
  totalReturnPct: number | null; // cumulative P&L; null until enough signals
  sharpe: number | null; // annualized
  winRatePct: number | null;
  exposurePct: number | null;
  maxDrawdownPct: number; // negative number
  forwardCurve: number[]; // real normalized equity curve
  status: "LIVE" | "INCUB" | "BACKTEST";
}

/** A signal as recorded in the chain — the signal plus its tamper-evident link. */
export interface SignalRecord {
  seq: number;
  ts: string; // entry write time
  hash: string; // entry hash
  prevHash: string;
  signal: Signal;
}

/** Everything the detail page needs to render the dossier + verification. */
export interface StrategyDetail {
  metrics: StrategyMetrics;
  /** The committing entry — its hash is the public commitment. */
  commit: { seq: number; ts: string; hash: string; prevHash: string };
  signals: SignalRecord[];
  chain: { ok: boolean; brokenAt: number | null };
}

export const GENESIS_HASH = "0".repeat(64);
