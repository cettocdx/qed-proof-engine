import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ROSTER } from "@/lib/bots/roster";
import { getWallet } from "@/lib/portfolio/wallet";
import { hirePriceUsd } from "@/lib/bots/temperament";

export const runtime = "nodejs";

// Pending orders: orderId → email mapping, joined by the webhook on fulfillment
// (NOWPayments' invoice API does not carry a payer email field).
const PENDING_FILE = path.join(process.cwd(), "lib", "data", "pending-orders.jsonl");

export async function POST(req: Request) {
  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "payments not configured" }, { status: 503 });

  const body = await req.json() as { agentId?: string; email?: string; payCurrency?: string };
  const { email, payCurrency } = body;

  // SERVER-SIDE agent validation — never trust a client-supplied id or price.
  // agentId must match a real roster bot exactly (defeats order_id injection).
  const bot = ROSTER.find((b) => b.id === body.agentId);
  if (!bot) return NextResponse.json({ error: "unknown agent" }, { status: 404 });
  const agentId = bot.id;
  const agentName = bot.name;

  // SERVER-SIDE price — recomputed from live wallet, identical to what /api/hire
  // shows. The client cannot dictate the amount.
  const wallet = await getWallet(bot).catch(() => null);
  const pnlUsd = (wallet?.realizedPnl ?? 0) + (wallet?.unrealizedPnl ?? 0);
  const returnPct = wallet?.returnPct ?? 0;
  const priceUsd = hirePriceUsd(bot, { pnlUsd, returnPct });

  // Allowed payment coins: USDT (TRON), USDC (Solana), SOL, ETH
  const ALLOWED = new Set(["usdttrc20", "usdcsol", "sol", "eth"]);
  const coin = ALLOWED.has(payCurrency ?? "") ? payCurrency! : "usdttrc20";

  const orderId = `${agentId}-${Date.now()}`;

  const payload = {
    price_amount: priceUsd,
    price_currency: "usd",
    pay_currency: coin,
    order_id: orderId,
    order_description: `QED Agent Access: ${agentName} (${agentId}) — 1 month`,
    ipn_callback_url: "https://qed.llc/api/payments/webhook",
    success_url: "https://qed.llc/hire?payment=success",
    cancel_url: "https://qed.llc/hire?payment=cancelled",
  };

  const res = await fetch("https://api.nowpayments.io/v1/invoice", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[payments] NOWPayments error:", err.slice(0, 300));
    return NextResponse.json({ error: "payment creation failed" }, { status: 502 });
  }

  const data = await res.json() as { id: string; invoice_url: string };

  // Record the pending order so the webhook can attach the email on fulfillment
  try {
    await fs.mkdir(path.dirname(PENDING_FILE), { recursive: true });
    await fs.appendFile(
      PENDING_FILE,
      JSON.stringify({ ts: new Date().toISOString(), orderId, email: email ?? null, agentId, agentName, priceUsd, coin, invoiceId: data.id }) + "\n",
      "utf8",
    );
  } catch { /* non-fatal */ }

  return NextResponse.json({ invoice_url: data.invoice_url, invoice_id: data.id });
}
