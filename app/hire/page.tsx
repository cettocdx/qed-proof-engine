"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SiteNav from "@/components/SiteNav";
import EquityChart from "@/components/EquityChart";

function PaymentBanner() {
  const params = useSearchParams();
  const status = params.get("payment");
  const [dismissed, setDismissed] = useState(false);
  if (!status || dismissed) return null;

  if (status === "success") {
    return (
      <div className="mb-6 flex items-start justify-between border border-green/50 bg-green/10 px-4 py-3">
        <div>
          <div className="text-[12px] tracking-wider text-green">✓ PAYMENT RECEIVED</div>
          <p className="mt-1 text-[11px] text-fg-dim">
            Your 30-day agent access is being activated. A confirmation will be sent to your email
            once the transaction settles on-chain (usually a few minutes).
          </p>
        </div>
        <button onClick={() => setDismissed(true)} className="ml-4 text-[11px] text-fg-mute hover:text-fg">✕</button>
      </div>
    );
  }
  if (status === "cancelled") {
    return (
      <div className="mb-6 flex items-start justify-between border border-amber/50 bg-amber/10 px-4 py-3">
        <div>
          <div className="text-[12px] tracking-wider text-amber">PAYMENT CANCELLED</div>
          <p className="mt-1 text-[11px] text-fg-dim">No charge was made. You can retry anytime.</p>
        </div>
        <button onClick={() => setDismissed(true)} className="ml-4 text-[11px] text-fg-mute hover:text-fg">✕</button>
      </div>
    );
  }
  return null;
}

const PAY_COINS = [
  { id: "usdttrc20", label: "USDT · TRON" },
  { id: "usdcsol", label: "USDC · SOL" },
  { id: "sol", label: "SOLANA" },
  { id: "eth", label: "ETHEREUM" },
] as const;

function PayButton({ agentId, agentName, priceUsd }: { agentId: string; agentName: string; priceUsd: number }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [coin, setCoin] = useState<string>("usdttrc20");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId, agentName, priceUsd, email, payCurrency: coin }),
      });
      const data = await res.json() as { invoice_url?: string; pay_address?: string; pay_amount?: number; pay_currency?: string; error?: string };
      if (!res.ok || data.error) { setError("Payment error. Try again."); setLoading(false); return; }
      // Redirect to NOWPayments invoice page
      const url = data.invoice_url ?? `https://nowpayments.io/payment/?iid=${data.pay_address}`;
      window.location.href = url;
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
    }
  };

  if (open) {
    return (
      <form onSubmit={submit} className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap gap-1">
          {PAY_COINS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCoin(c.id)}
              className={`border px-2 py-1 text-[9px] tracking-wider transition-colors ${
                coin === c.id
                  ? "border-cyan bg-cyan/15 text-cyan"
                  : "border-border-2 text-fg-mute hover:border-fg-dim hover:text-fg"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            ref={inputRef}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            autoFocus
            className="w-36 border border-cyan/40 bg-bg px-2 py-1.5 text-[10px] text-fg outline-none placeholder:text-fg-mute focus:border-cyan"
          />
          <button
            type="submit"
            disabled={loading}
            className="border border-cyan/60 bg-cyan/10 px-3 py-1.5 text-[10px] tracking-wider text-cyan hover:bg-cyan/20 disabled:opacity-50"
          >
            {loading ? "…" : "PAY"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="border border-border-2 px-2 py-1.5 text-[10px] text-fg-mute hover:text-fg"
          >
            ✕
          </button>
        </div>
        {error && <div className="text-[10px] text-danger">{error}</div>}
        <div className="text-[9px] text-fg-mute">Crypto payment via NOWPayments</div>
      </form>
    );
  }

  return (
    <button
      onClick={() => setOpen(true)}
      className="border border-cyan bg-cyan/10 px-4 py-2 text-[11px] tracking-wider text-cyan hover:bg-cyan/20"
    >
      HIRE NOW
    </button>
  );
}

type Card = {
  id: string;
  name: string;
  handle: string;
  archetype: string;
  homeSymbol: string;
  temperament: { kind: string; label: string; riskPct: number; minConfidence: number; blurb: string };
  bio: { bio: string; strengths: string[]; weaknesses: string[] };
  universe: { label: string; size: number };
  skillLabel: string;
  evolved: { from: string; at: string } | null;
  coach: { lesson: string; modifier: number } | null;
  equity: number;
  pnlUsd: number;
  returnPct: number;
  winRate: number | null;
  openPositions: number;
  closedPositions: number;
  price: number;
  curve: number[];
  signalCount: number;
};

const TEMPERAMENT_STYLE: Record<string, string> = {
  aggressive: "text-red-400 border-red-400/40 bg-red-400/5",
  balanced: "text-amber border-amber/40 bg-amber/5",
  calm: "text-cyan border-cyan/40 bg-cyan/5",
};

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function HirePage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      fetch("/api/hire")
        .then((r) => r.json() as Promise<{ cards: Card[] }>)
        .then((d) => { setCards(d.cards); setUpdatedAt(new Date()); setLoading(false); })
        .catch(() => setLoading(false));
    load();
    const id = setInterval(load, 60_000); // pricing re-marks every minute
    return () => clearInterval(id);
  }, []);

  return (
    <main className="min-h-screen bg-bg px-6 py-10 font-mono">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8"><SiteNav active="/hire" /></div>
        <Suspense><PaymentBanner /></Suspense>
        <div className="mb-8">
          <h1 className="font-serif text-4xl text-fg" style={{ fontFamily: "var(--font-serif)" }}>
            Hire an Agent
          </h1>
          <p className="mt-2 text-xs text-fg-dim">
            Price = base + 5% of profits earned + $12 per ROI point — winners get expensive, losers get cheap.
            Most expensive (top earner) first. ∎
          </p>
          {updatedAt && (
            <p className="mt-1 flex items-center gap-1.5 text-[10px] tracking-widest text-green">
              <span className="blink inline-block h-1.5 w-1.5 rounded-full bg-green" />
              LIVE PRICING · re-marks every 60s · {updatedAt.toLocaleTimeString("en-US")}
            </p>
          )}
        </div>

        {loading && <div className="py-20 text-center text-sm text-fg-dim">Loading…</div>}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((c, rank) => {
            const retColor = c.returnPct > 0 ? "text-green" : c.returnPct < 0 ? "text-danger" : "text-fg-dim";
            return (
              <div key={c.id} className="flex flex-col border border-border-2 bg-surface/40 p-5">
                {/* header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[10px] text-fg-mute tabular">#{rank + 1}</span>
                      <Link href={`/strategy/${c.id}`} className="text-lg text-fg hover:text-cyan">
                        {c.name}
                      </Link>
                    </div>
                    <div className="text-[10px] text-fg-dim">{c.handle} · {c.id}</div>
                  </div>
                  <span className={`border px-2 py-0.5 text-[10px] tracking-wider ${TEMPERAMENT_STYLE[c.temperament.kind]}`}>
                    {c.temperament.label}
                  </span>
                </div>

                {/* money */}
                <div className="mt-4 grid grid-cols-3 gap-2 border-y border-border-2 py-3 text-center">
                  <div>
                    <div className="text-[9px] text-fg-mute">EQUITY</div>
                    <div className="text-sm text-fg tabular">{fmt(c.equity)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-fg-mute">PROFIT</div>
                    <div className={`text-sm tabular ${c.pnlUsd >= 0 ? "text-green" : "text-danger"}`}>
                      {c.pnlUsd >= 0 ? "+" : "−"}{fmt(Math.abs(c.pnlUsd)).slice(0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] text-fg-mute">ROI</div>
                    <div className={`text-sm tabular ${retColor}`}>{(c.returnPct * 100).toFixed(2)}%</div>
                  </div>
                </div>

                {/* interactive equity chart */}
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[9px] text-fg-mute">
                    <span>LIVE EQUITY · 5-MIN — hover to inspect</span>
                    <span>{c.signalCount} signals</span>
                  </div>
                  <EquityChart curve={c.curve} />
                </div>

                {/* bio */}
                <p className="mt-3 text-[11px] leading-relaxed text-fg-dim">{c.bio.bio}</p>

                {/* live system specs */}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-fg-dim">
                  <span>SCANS: <span className="text-cyan">{c.universe.size > 0 ? `${c.universe.size} ${c.universe.label}` : c.universe.label}</span> / hour</span>
                  <span>SIZING: <span className="text-fg">equity × {(c.temperament.riskPct * 100).toFixed(0)}%</span></span>
                  <span>WIN RATE: <span className="text-fg">{c.winRate != null ? `${(c.winRate * 100).toFixed(0)}%` : "—"}</span></span>
                </div>
                {c.evolved && (
                  <p className="mt-2 text-[10px] text-amber/80">
                    ⟳ Self-evolved its strategy ({new Date(c.evolved.at).toLocaleDateString("en-US")})
                  </p>
                )}
                {c.coach && (
                  <p className="mt-1 text-[10px] text-cyan/70">
                    ◆ COACH: {c.coach.lesson.slice(0, 100)}{c.coach.lesson.length > 100 ? "…" : ""} ({c.coach.modifier}×)
                  </p>
                )}

                {/* price + actions — pinned to card bottom */}
                <div className="mt-auto pt-4">
                  <p className="mb-2 text-[9px] text-fg-mute/60">
                    Paper trading only · Simulated performance · Not financial advice
                  </p>
                  <div className="flex items-center justify-between border-t border-border-2 pt-3">
                    <div>
                      <div className="text-xl text-fg tabular">{fmt(c.price)}<span className="text-[10px] text-fg-dim">/mo</span></div>
                      <div className="text-[9px] text-fg-mute">
                        {c.closedPositions} closed · {c.openPositions} open trades
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href={`/strategy/${c.id}`}
                        className="border border-border-2 px-3 py-2 text-[10px] tracking-wider text-fg-dim hover:border-fg-dim hover:text-fg"
                      >
                        RECORDS
                      </Link>
                      <PayButton agentId={c.id} agentName={c.name} priceUsd={c.price} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
