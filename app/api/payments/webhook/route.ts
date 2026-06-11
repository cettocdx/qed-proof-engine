import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { newAccessKey } from "@/lib/subscribers/access";
import { ROSTER } from "@/lib/bots/roster";

export const runtime = "nodejs";

const LOG_FILE = path.join(process.cwd(), "lib", "data", "payments.jsonl");
const SUBSCRIBERS_FILE = path.join(process.cwd(), "lib", "data", "subscribers.jsonl");
const PENDING_FILE = path.join(process.cwd(), "lib", "data", "pending-orders.jsonl");

/** Look up the email captured at checkout for this order (invoice API carries no payer email). */
async function emailForOrder(orderId: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(PENDING_FILE, "utf8");
    for (const line of raw.split("\n").filter(Boolean).reverse()) {
      try {
        const rec = JSON.parse(line) as { orderId?: string; email?: string | null };
        if (rec.orderId === orderId) return rec.email ?? null;
      } catch { /* skip */ }
    }
  } catch { /* no pending file yet */ }
  return null;
}

/** NOWPayments IPN signature: HMAC-SHA512 over the JSON body with keys sorted. */
function verifySignature(rawBody: Record<string, unknown>, sig: string | null, secret: string): boolean {
  if (!sig) return false;
  const sorted = JSON.stringify(rawBody, Object.keys(rawBody).sort());
  const expected = createHmac("sha512", secret).update(sorted).digest("hex");
  // Constant-time compare — defeats byte-by-byte timing analysis.
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Has this payment_id already been fulfilled? (replay / idempotency guard) */
async function alreadyFulfilled(paymentId: string): Promise<boolean> {
  if (!paymentId) return false;
  try {
    const raw = await fs.readFile(SUBSCRIBERS_FILE, "utf8");
    return raw.split("\n").filter(Boolean).some((l) => {
      try { return String((JSON.parse(l) as { paymentId?: string }).paymentId) === paymentId; }
      catch { return false; }
    });
  } catch { return false; }
}

type IpnPayload = {
  payment_id?: number | string;
  payment_status?: string;
  order_id?: string;
  order_description?: string;
  price_amount?: number;
  pay_currency?: string;
  actually_paid?: number;
  payer_email?: string;
};

export async function POST(req: Request) {
  const body = await req.json() as IpnPayload & Record<string, unknown>;

  // Signature check — strictly fail closed: no secret configured → no webhooks.
  const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!ipnSecret) {
    console.error("[payments] NOWPAYMENTS_IPN_SECRET not set — webhook rejected");
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }
  const sig = req.headers.get("x-nowpayments-sig");
  if (!verifySignature(body, sig, ipnSecret)) {
    console.warn("[payments] webhook signature mismatch — rejected");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // Durable raw log (audit trail)
  try {
    await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
    await fs.appendFile(LOG_FILE, JSON.stringify({ ts: new Date().toISOString(), verified: true, ...body }) + "\n", "utf8");
  } catch { /* non-fatal */ }

  // Fulfillment: on confirmed payment, record a subscriber with 30-day access.
  const status = String(body.payment_status ?? "");
  if (status === "finished" || status === "confirmed") {
    // Idempotency: a replayed webhook (same payment_id) must NOT mint a new key.
    const paymentId = String(body.payment_id ?? "");
    if (await alreadyFulfilled(paymentId)) {
      console.log(`[payments] payment ${paymentId} already fulfilled — replay ignored`);
      return NextResponse.json({ ok: true, note: "already fulfilled" });
    }

    // Validate the agent against the roster (defeats order_id injection like
    // "AGT-029-fake-..."). Reject anything that isn't an exact known bot id.
    const orderId = String(body.order_id ?? "");
    const agentId = orderId.match(/^(AGT-\d{3})-\d+$/)?.[1] ?? "";
    if (!ROSTER.some((b) => b.id === agentId)) {
      console.warn(`[payments] unknown/malformed agent in order ${orderId} — fulfillment withheld`);
      return NextResponse.json({ ok: true, note: "invalid agent — not fulfilled" });
    }

    // Underpayment guard: NOWPayments reports the USD-equivalent it actually
    // received in outcome_price (or price_amount on full settles). Reject
    // fulfillment if the customer paid less than 95% of the asking price.
    const asked = Number(body.price_amount ?? 0);
    const got = Number((body as Record<string, unknown>).outcome_price ?? body.price_amount ?? 0);
    if (asked > 0 && got > 0 && got < asked * 0.95) {
      console.warn(`[payments] underpayment: asked $${asked}, got $${got} — fulfillment withheld (order ${body.order_id})`);
      return NextResponse.json({ ok: true, note: "underpaid — not fulfilled" });
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sub = {
      email: body.payer_email ?? await emailForOrder(orderId),
      agentId,
      orderId,
      paymentId,
      accessKey: newAccessKey(),
      amountUsd: body.price_amount ?? null,
      paidCurrency: body.pay_currency ?? null,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    try {
      await fs.mkdir(path.dirname(SUBSCRIBERS_FILE), { recursive: true });
      await fs.appendFile(SUBSCRIBERS_FILE, JSON.stringify(sub) + "\n", "utf8");
      console.log(`[payments] subscriber recorded: ${agentId} until ${sub.expiresAt}`);
    } catch (e) {
      console.error("[payments] subscriber write failed:", (e as Error).message);
    }

    // Deliver the access key by email (skips gracefully if no provider configured)
    if (sub.email) {
      const { sendEmail, accessKeyEmail } = await import("@/lib/email/send");
      const msg = accessKeyEmail({ agentId, accessKey: sub.accessKey, expiresAt: sub.expiresAt });
      await sendEmail(String(sub.email), msg.subject, msg.html);
    }
  }

  return NextResponse.json({ ok: true });
}
