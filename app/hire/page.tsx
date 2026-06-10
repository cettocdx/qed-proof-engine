import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import { ROSTER } from "@/lib/bots/roster";
import { getAllWallets } from "@/lib/portfolio/wallet";
import { temperamentFor, bioFor, hirePriceUsd } from "@/lib/bots/temperament";
import { loadSkillOverrides, effectiveSkillId } from "@/lib/brain/evolution";
import { loadCoachNotes } from "@/lib/brain/coach";
import { getCryptoUniverse, getMemeUniverse, getEquityUniverse } from "@/lib/market/universe";
import { SKILLS } from "@/lib/strategy/skills";

const MEME_IDS = new Set(["AGT-029", "AGT-030", "AGT-031", "AGT-032", "AGT-033", "AGT-034", "AGT-035"]);

export const dynamic = "force-dynamic";

const TEMPERAMENT_STYLE: Record<string, string> = {
  aggressive: "text-red-400 border-red-400/40 bg-red-400/5",
  balanced: "text-amber border-amber/40 bg-amber/5",
  calm: "text-cyan border-cyan/40 bg-cyan/5",
};

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function HirePage() {
  const [wallets, overrides, coachNotes, cryptoUni, memeUni, eqUni] = await Promise.all([
    getAllWallets(),
    loadSkillOverrides(),
    loadCoachNotes(),
    getCryptoUniverse().catch(() => []),
    getMemeUniverse().catch(() => []),
    getEquityUniverse().catch(() => []),
  ]);
  const byId = new Map(wallets.map((w) => [w.strategyId, w]));

  const cards = ROSTER.map((bot) => {
    const w = byId.get(bot.id);
    const ret = w?.returnPct ?? 0;
    const skillId = effectiveSkillId(bot, overrides);
    const universe = MEME_IDS.has(bot.id)
      ? { label: "meme coin (mcap > $300k)", size: memeUni.length }
      : bot.market === "CRYPTO"
        ? { label: "Binance çifti", size: cryptoUni.length }
        : { label: "NASDAQ hissesi", size: eqUni.length };
    return {
      bot,
      wallet: w,
      temperament: temperamentFor(bot),
      bio: bioFor(bot),
      price: hirePriceUsd(bot, ret),
      skillId,
      skillLabel: SKILLS[skillId]?.label ?? skillId,
      evolved: overrides[bot.id] ?? null,
      coach: coachNotes[bot.id] ?? null,
      universe,
    };
  }).sort((a, b) => (b.wallet?.equity ?? 0) - (a.wallet?.equity ?? 0));

  return (
    <main className="min-h-screen bg-bg px-6 py-10 font-mono">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8"><SiteNav active="/hire" /></div>
        <div className="mb-8">
          <h1 className="font-serif text-4xl text-fg" style={{ fontFamily: "var(--font-serif)" }}>
            Hire an Agent
          </h1>
          <p className="mt-2 text-xs text-fg-dim">
            Every agent trades a $100,000 book with a tamper-proof, hash-chained track record.
            Pricing scales with verified live performance. ∎
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ bot, wallet, temperament, bio, price, skillLabel, evolved, coach, universe }) => {
            const ret = wallet?.returnPct ?? 0;
            const retColor = ret > 0 ? "text-green" : ret < 0 ? "text-red-400" : "text-fg-dim";
            return (
              <div key={bot.id} className="border border-border-2 bg-surface/40 p-5">
                {/* header */}
                <div className="flex items-start justify-between">
                  <div>
                    <Link href={`/strategy/${bot.id}`} className="text-lg text-fg hover:text-cyan">
                      {bot.name}
                    </Link>
                    <div className="text-[10px] text-fg-dim">{bot.handle} · {bot.id}</div>
                  </div>
                  <span className={`border px-2 py-0.5 text-[10px] tracking-wider ${TEMPERAMENT_STYLE[temperament.kind]}`}>
                    {temperament.label}
                  </span>
                </div>

                {/* wallet */}
                <div className="mt-4 grid grid-cols-3 gap-2 border-y border-border-2 py-3 text-center">
                  <div>
                    <div className="text-[9px] text-fg-dim">EQUITY</div>
                    <div className="text-sm text-fg">{wallet ? fmt(wallet.equity) : "$100,000"}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-fg-dim">RETURN</div>
                    <div className={`text-sm ${retColor}`}>{(ret * 100).toFixed(2)}%</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-fg-dim">WIN RATE</div>
                    <div className="text-sm text-fg">
                      {wallet?.winRate != null ? `${(wallet.winRate * 100).toFixed(0)}%` : "—"}
                    </div>
                  </div>
                </div>

                {/* bio */}
                <p className="mt-3 text-[11px] leading-relaxed text-fg-dim">{bio.bio}</p>

                <div className="mt-3 grid grid-cols-2 gap-3 text-[10px]">
                  <div>
                    <div className="mb-1 text-green/70">STRENGTHS</div>
                    <ul className="space-y-0.5 text-fg-dim">
                      {bio.strengths.map((s) => <li key={s}>+ {s}</li>)}
                    </ul>
                  </div>
                  <div>
                    <div className="mb-1 text-red-400/70">WEAKNESSES</div>
                    <ul className="space-y-0.5 text-fg-dim">
                      {bio.weaknesses.map((s) => <li key={s}>− {s}</li>)}
                    </ul>
                  </div>
                </div>

                {/* trading style — live system values */}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-fg-dim">
                  <span>TARAMA: <span className="text-cyan">{universe.size > 0 ? `${universe.size} ${universe.label}` : universe.label}</span> / saat</span>
                  <span>AKTİF SKILL: <span className="text-fg">{skillLabel}</span></span>
                  <span>İŞLEM BOYUTU: <span className="text-fg">equity × {(temperament.riskPct * 100).toFixed(0)}%</span></span>
                  <span>GÜVEN EŞİĞİ: <span className="text-fg">{temperament.minConfidence}</span></span>
                  <span>ANA SEMBOL: <span className="text-fg">{bot.symbols[0]}</span></span>
                </div>
                {evolved && (
                  <p className="mt-2 text-[10px] text-amber/80">
                    ⟳ EVRİLDİ: {SKILLS[evolved.prevSkill]?.label ?? evolved.prevSkill} → {skillLabel}
                    <span className="text-fg-mute"> ({new Date(evolved.evolvedAt).toLocaleDateString("tr-TR")})</span>
                  </p>
                )}
                {coach && (
                  <p className="mt-1 text-[10px] text-cyan/70">
                    ◆ KOÇ NOTU: {coach.lesson.slice(0, 110)}{coach.lesson.length > 110 ? "…" : ""}
                    <span className="text-fg-mute"> (çarpan {coach.modifier}×)</span>
                  </p>
                )}
                <p className="mt-2 text-[10px] italic text-fg-dim">&ldquo;{temperament.blurb}&rdquo;</p>

                {/* price */}
                <div className="mt-4 flex items-center justify-between border-t border-border-2 pt-3">
                  <div>
                    <div className="text-xl text-fg">{fmt(price)}<span className="text-[10px] text-fg-dim">/mo</span></div>
                    <div className="text-[9px] text-fg-dim">
                      {wallet?.closedPositions ?? 0} closed trades · {wallet?.openPositions ?? 0} open
                    </div>
                  </div>
                  <Link
                    href={`/strategy/${bot.id}`}
                    className="border border-cyan/40 bg-cyan/5 px-4 py-2 text-[11px] tracking-wider text-cyan hover:bg-cyan/15"
                  >
                    VIEW TRACK RECORD →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
