"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import EquityChart from "@/components/EquityChart";

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
        <div className="mb-8">
          <h1 className="font-serif text-4xl text-fg" style={{ fontFamily: "var(--font-serif)" }}>
            Hire an Agent
          </h1>
          <p className="mt-2 text-xs text-fg-dim">
            Fiyat = taban + kazandığı paranın %5&apos;i + ROI puanı başına $12 — kazandıkça pahalanır, kaybedince ucuzlar.
            En pahalı (en çok kazanan) üstte. ∎
          </p>
          {updatedAt && (
            <p className="mt-1 flex items-center gap-1.5 text-[10px] tracking-widest text-green">
              <span className="blink inline-block h-1.5 w-1.5 rounded-full bg-green" />
              CANLI FİYATLAMA · 60 sn&apos;de bir güncellenir · {updatedAt.toLocaleTimeString("tr-TR")}
            </p>
          )}
        </div>

        {loading && <div className="py-20 text-center text-sm text-fg-dim">Yükleniyor…</div>}

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
                    <div className="text-[9px] text-fg-mute">KAZANÇ</div>
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
                    <span>EQUITY EĞRİSİ — mouse ile gez</span>
                    <span>{c.signalCount} sinyal</span>
                  </div>
                  <EquityChart curve={c.curve} />
                </div>

                {/* bio */}
                <p className="mt-3 text-[11px] leading-relaxed text-fg-dim">{c.bio.bio}</p>

                {/* live system specs */}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-fg-dim">
                  <span>TARAMA: <span className="text-cyan">{c.universe.size > 0 ? `${c.universe.size} ${c.universe.label}` : c.universe.label}</span> / saat</span>
                  <span>BOYUT: <span className="text-fg">equity × {(c.temperament.riskPct * 100).toFixed(0)}%</span></span>
                  <span>WIN RATE: <span className="text-fg">{c.winRate != null ? `${(c.winRate * 100).toFixed(0)}%` : "—"}</span></span>
                </div>
                {c.evolved && (
                  <p className="mt-2 text-[10px] text-amber/80">
                    ⟳ Stratejisini kendi kendine güncelledi ({new Date(c.evolved.at).toLocaleDateString("tr-TR")})
                  </p>
                )}
                {c.coach && (
                  <p className="mt-1 text-[10px] text-cyan/70">
                    ◆ KOÇ: {c.coach.lesson.slice(0, 100)}{c.coach.lesson.length > 100 ? "…" : ""} ({c.coach.modifier}×)
                  </p>
                )}

                {/* price + actions — pinned to card bottom */}
                <div className="mt-auto pt-4">
                  <div className="flex items-center justify-between border-t border-border-2 pt-3">
                    <div>
                      <div className="text-xl text-fg tabular">{fmt(c.price)}<span className="text-[10px] text-fg-dim">/ay</span></div>
                      <div className="text-[9px] text-fg-mute">
                        {c.closedPositions} kapalı · {c.openPositions} açık işlem
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href={`/strategy/${c.id}`}
                        className="border border-border-2 px-3 py-2 text-[10px] tracking-wider text-fg-dim hover:border-fg-dim hover:text-fg"
                      >
                        KAYITLAR
                      </Link>
                      <button
                        title="Ödeme entegrasyonu yakında"
                        className="cursor-not-allowed border border-cyan/40 bg-cyan/5 px-4 py-2 text-[11px] tracking-wider text-cyan/60"
                      >
                        KİRALA · YAKINDA
                      </button>
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
