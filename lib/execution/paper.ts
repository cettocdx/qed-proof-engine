import { promises as fs } from "node:fs";
import path from "node:path";
import type { Signal, Market } from "../ledger/schema";

/**
 * Paper execution adapter.
 *
 * Equities  → Alpaca PAPER API (real paper account, $0 real money)
 * Crypto    → Dry-run simulator (logged locally)
 *
 * Every order is appended to paper-orders.jsonl for audit.
 */

const ORDERS_LOG = path.join(process.cwd(), "lib", "data", "paper-orders.jsonl");
export const PORTFOLIO_SIZE = 100_000; // $100k per agent
export const NOTIONAL_USD   =  10_000; // 10% per trade

const ALPACA_BASE = "https://paper-api.alpaca.markets";

export interface PaperOrder {
  ts: string;
  strategyId: string;
  symbol: string;
  market: Market;
  side: "buy" | "sell";
  qty: number;
  notional: number;
  refPrice: number;
  venue: "alpaca-paper" | "dry-run";
  status: "submitted" | "simulated" | "error";
  alpacaOrderId?: string;
  detail?: string;
}

function sideFor(action: Signal["action"]): "buy" | "sell" | null {
  if (action === "BUY" || action === "COVER") return "buy";
  if (action === "SELL" || action === "SHORT") return "sell";
  return null;
}

async function alpacaReq(method: string, endpoint: string, body?: unknown) {
  const key = process.env.ALPACA_API_KEY_ID;
  const secret = process.env.ALPACA_API_SECRET_KEY;
  if (!key || !secret) throw new Error("no-alpaca-keys");
  const res = await fetch(`${ALPACA_BASE}${endpoint}`, {
    method,
    headers: {
      "APCA-API-KEY-ID": key,
      "APCA-API-SECRET-KEY": secret,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`alpaca ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}

async function placeAlpacaOrder(
  symbol: string,
  side: "buy" | "sell",
  notional: number,
  refPrice: number,
): Promise<{ orderId: string; detail: string }> {
  // Check for existing position on this symbol
  let existingQty = 0;
  let existingSide = "";
  try {
    const positions = await alpacaReq("GET", "/v2/positions") as { symbol: string; side: string; qty: string }[];
    const existing = positions.find((p) => p.symbol === symbol);
    if (existing) {
      existingQty = parseFloat(existing.qty);
      existingSide = existing.side;
    }
  } catch { /* best-effort */ }

  // If we have a long position and got SELL → close it (don't short)
  if (side === "sell" && existingSide === "long" && existingQty > 0) {
    const closeOrder = await alpacaReq("DELETE", `/v2/positions/${symbol}`) as { id?: string; status?: string } | null;
    return {
      orderId: (closeOrder as { id?: string })?.id ?? "closed",
      detail: `closed long position qty=${existingQty}`,
    };
  }

  // If SELL with no existing long position → log as dry-run (no naked shorts on fractional)
  if (side === "sell" && existingSide !== "long") {
    return { orderId: "dry-run", detail: `sell skipped: no long position to close (alpaca no-short)` };
  }

  // BUY: use notional (fractional)
  const order = await alpacaReq("POST", "/v2/orders", {
    symbol,
    notional: String(notional),
    side,
    type: "market",
    time_in_force: "day",
  }) as { id: string; status: string };

  return { orderId: order.id, detail: `order=${order.id} status=${order.status}` };
}

async function log(order: PaperOrder) {
  await fs.mkdir(path.dirname(ORDERS_LOG), { recursive: true });
  await fs.appendFile(ORDERS_LOG, JSON.stringify(order) + "\n", "utf8");
}

export async function placePaperOrder(
  signal: Signal,
  market: Market,
  notional: number = NOTIONAL_USD,
): Promise<PaperOrder | null> {
  const side = sideFor(signal.action);
  if (!side) return null;
  const refPrice = signal.meta?.price ?? 0;
  if (refPrice <= 0) return null;

  const qty = +(notional / refPrice).toFixed(market === "CRYPTO" ? 6 : 4);

  const base: PaperOrder = {
    ts: new Date().toISOString(),
    strategyId: signal.strategyId,
    symbol: signal.symbol,
    market,
    side,
    qty,
    notional,
    refPrice,
    venue: "dry-run",
    status: "simulated",
    detail: `dry-run ${side} ${qty} @ ~${refPrice}`,
  };

  if (market === "US-EQ" && process.env.ALPACA_API_KEY_ID) {
    try {
      const r = await placeAlpacaOrder(signal.symbol, side, notional, refPrice);
      const order: PaperOrder = {
        ...base,
        venue: "alpaca-paper",
        status: "submitted",
        alpacaOrderId: r.orderId,
        detail: r.detail,
      };
      await log(order);
      return order;
    } catch (e) {
      const order: PaperOrder = { ...base, venue: "alpaca-paper", status: "error", detail: (e as Error).message };
      await log(order);
      return order;
    }
  }

  await log(base);
  return base;
}

export const PAPER_ORDERS_LOG = ORDERS_LOG;
