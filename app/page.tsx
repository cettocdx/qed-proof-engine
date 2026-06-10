"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "framer-motion";
import Wordmark, { QedMark } from "@/components/Wordmark";
import HudOverlay from "@/components/HudOverlay";
import ScoreboardTeaser from "@/components/ScoreboardTeaser";

// 3D scene is client/WebGL only — load without SSR.
const PointCloudHero = dynamic(() => import("@/components/PointCloudHero"), {
  ssr: false,
});

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, delay, ease: "easeOut" as const },
});

/** A formula block: equation + plain-language meaning. */
function Formula({
  index, title, eq, where, meaning,
}: {
  index: string; title: string; eq: React.ReactNode; where?: string; meaning: string;
}) {
  return (
    <motion.div {...fade(0.05)} className="border border-border-2 bg-surface/40 p-6">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] tracking-[0.3em] text-cyan/70">{index}</span>
        <span className="text-[10px] tracking-widest text-fg-dim">{title}</span>
      </div>
      <div className="my-5 overflow-x-auto whitespace-nowrap text-center font-serif text-xl text-fg sm:text-2xl"
           style={{ fontFamily: "var(--font-serif)" }}>
        {eq}
      </div>
      {where && <p className="mb-2 text-center text-[10px] text-fg-mute">{where}</p>}
      <p className="text-[11px] leading-relaxed text-fg-dim">{meaning}</p>
    </motion.div>
  );
}

export default function Home() {
  return (
    <main className="relative min-h-screen bg-bg">
      {/* ─── HERO ──────────────────────────────────────────────────── */}
      <section className="hud-scanlines relative h-screen w-full overflow-hidden">
        <div className="hud-grid absolute inset-0" />
        <div className="absolute inset-0">
          <PointCloudHero />
        </div>
        <div className="hud-vignette pointer-events-none absolute inset-0" />
        <HudOverlay />

        {/* top nav */}
        <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-6 py-5">
          <Wordmark />
          <nav className="hidden items-center gap-8 text-[12px] tracking-widest text-fg-dim sm:flex">
            <Link className="transition-colors hover:text-fg" href="/scoreboard">SCOREBOARD</Link>
            <Link className="transition-colors hover:text-fg" href="/positions">POSITIONS</Link>
            <Link className="transition-colors hover:text-fg" href="/hire">HIRE</Link>
            <Link
              className="border border-border-2 px-3 py-1.5 text-fg transition-colors hover:border-cyan hover:text-cyan"
              href="/hire"
            >
              HIRE AN AGENT
            </Link>
          </nav>
        </header>

        {/* hero copy */}
        <div className="absolute inset-x-0 bottom-0 z-30 px-6 pb-24">
          <div className="mx-auto max-w-5xl">
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-4 text-[11px] tracking-[0.35em] text-cyan/80"
            >
              ∎ QUOD ERAT DEMONSTRANDUM
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08 }}
              className="max-w-3xl font-serif text-5xl leading-[1.05] text-fg sm:text-7xl"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Alpha is a theorem.
              <br />
              <span className="text-cyan">We prove it live.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.16 }}
              className="mt-6 max-w-xl text-sm leading-relaxed text-fg-dim"
            >
              35 autonomous trading agents, each running a four-layer decision
              brain on a $100,000 book. Every signal is hash-committed to an
              append-only ledger <em>before</em> the market can judge it.
              No cherry-picked backtests. Only theorems with live proofs.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.24 }}
              className="mt-8 flex items-center gap-4"
            >
              <Link
                href="/scoreboard"
                className="group flex items-center gap-2 bg-fg px-5 py-2.5 text-[13px] font-medium tracking-wide text-bg transition-colors hover:bg-cyan"
              >
                ENTER THE SCOREBOARD
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <a
                href="#mathematics"
                className="px-1 text-[13px] tracking-wide text-fg-dim underline-offset-4 transition-colors hover:text-fg hover:underline"
              >
                Read the mathematics
              </a>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── THE MATHEMATICS ───────────────────────────────────────── */}
      <section id="mathematics" className="relative border-t border-border-2 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <motion.div {...fade(0)} className="mb-14 max-w-2xl">
            <p className="mb-3 text-[11px] tracking-[0.35em] text-cyan/80">01 — THE MATHEMATICS</p>
            <h2 className="font-serif text-4xl text-fg" style={{ fontFamily: "var(--font-serif)" }}>
              Six equations run the entire system.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-fg-dim">
              Every decision an agent makes — what regime it is in, whether to act,
              how much to risk, where to exit, and whether the record can be trusted —
              reduces to the following.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Formula
              index="EQ. 1"
              title="TAMPER-PROOF LEDGER"
              eq={<>H<sub>n</sub> = SHA-256( H<sub>n−1</sub> ∥ payload<sub>n</sub> )</>}
              where="H₀ = 0²⁵⁶ — the genesis block"
              meaning="Every signal is appended to a hash chain. Each entry commits to the entire history before it: change one byte of any past trade and every subsequent hash breaks. The track record cannot be rewritten — only extended."
            />
            <Formula
              index="EQ. 2"
              title="MARKET REGIME — KAUFMAN EFFICIENCY"
              eq={<>ER = |P<sub>t</sub> − P<sub>t−n</sub>| / Σ<sub>i</sub> |P<sub>i</sub> − P<sub>i−1</sub>|</>}
              where="ER → 1: straight-line trend · ER → 0: pure noise"
              meaning="Before voting, the brain measures how efficiently price has travelled. ER > 0.35 declares a trend regime (momentum skills weighted 1.5×), otherwise range (mean-reversion 1.5×). If volatility exceeds 2.2× its median, the regime is chaos and every vote is discounted to 0.6×."
            />
            <Formula
              index="EQ. 3"
              title="REGIME-WEIGHTED ENSEMBLE CONSENSUS"
              eq={<>act ⟺ Σ<sub>v∈dir</sub> w<sub>r</sub>(v) / Σ<sub>v</sub> w<sub>r</sub>(v) ≥ 0.55</>}
              where="11 skills × parameter variants vote; wᵣ = regime weight"
              meaning="Eleven independent strategies — momentum, breakout, reversion, VWAP, multi-timeframe — vote on every bar. A trade only exists when at least 55% of regime-weighted votes agree on direction. One indicator's noise can never move the book."
            />
            <Formula
              index="EQ. 4"
              title="CONFIDENCE COMPOSITION"
              eq={<>c = min( 0.95, c̄<sub>ens</sub> · m<sub>mem</sub> · m<sub>coach</sub> ) · 𝟙[c ≥ θ<sub>temp</sub>]</>}
              where="m_mem ∈ {0, 0.5, 1, 1.2} · m_coach ∈ [0.7, 1.2]"
              meaning="Raw ensemble confidence is multiplied by the agent's memory of its own recent performance (5 straight losses → trading halted) and its LLM coach's modifier. The result must clear the agent's temperament threshold — a calm agent needs 0.50, an aggressive one only 0.25."
            />
            <Formula
              index="EQ. 5"
              title="POSITION SIZING & EXITS"
              eq={<>N = E · ρ &nbsp;&nbsp;·&nbsp;&nbsp; SL = P₀ ∓ 2·ATR₁₄ &nbsp;&nbsp;·&nbsp;&nbsp; TP = P₀ ± 4·ATR₁₄</>}
              where="E = live equity · ρ ∈ {5%, 10%, 15%} by temperament"
              meaning="Position size scales with the agent's live equity — winners compound, losers shrink. Stops sit at 2× the 14-bar Average True Range, targets at 4×: every trade is structured at a minimum 2:1 reward-to-risk before entry."
            />
            <Formula
              index="EQ. 6"
              title="WALK-FORWARD EVOLUTION"
              eq={<>θ* = argmax<sub>θ</sub> S<sub>test</sub>(θ) &nbsp; s.t. &nbsp; S<sub>train</sub>(θ) &gt; −0.05</>}
              where="S = return − ½·maxDD, scored on unseen data only"
              meaning="Every night each agent's parameters are re-optimized on the first 70% of recent data and selected purely on the held-out 30% — curve-fitting is structurally impossible to reward. If a rival skill scores 1.5× better on the agent's own market, the agent evolves: the weak skill is replaced. Natural selection, nightly."
            />
          </div>
        </div>
      </section>

      {/* ─── THE BRAIN ─────────────────────────────────────────────── */}
      <section className="relative border-t border-border-2 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <motion.div {...fade(0)} className="mb-14 max-w-2xl">
            <p className="mb-3 text-[11px] tracking-[0.35em] text-cyan/80">02 — THE BRAIN</p>
            <h2 className="font-serif text-4xl text-fg" style={{ fontFamily: "var(--font-serif)" }}>
              Four layers between an idea and an order.
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {[
              { n: "L1", t: "SKILL ENSEMBLE", d: "11 deterministic strategies vote on real OHLC bars, weighted by the detected market regime. ≥55% directional agreement required." },
              { n: "L2", t: "BOT MEMORY", d: "The agent reads its own ledger. Losing streaks throttle confidence to 0.5× or halt trading entirely; proven streaks earn a 1.2× boost." },
              { n: "L3", t: "ANALYST PANEL", d: "Three parallel LLM analysts — technical, macro, sentiment — each cast an independent vote. 2 of 3 must agree with the ensemble." },
              { n: "L4", t: "RISK VETO", d: "A final risk officer sees everything the layers produced and holds absolute veto power: APPROVE, REDUCE size, or kill the trade." },
            ].map((l, i) => (
              <motion.div key={l.n} {...fade(i * 0.06)} className="border border-border-2 bg-surface/40 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <span className="bg-cyan/10 px-2 py-0.5 text-[11px] text-cyan">{l.n}</span>
                  <span className="text-[10px] tracking-widest text-fg-dim">{l.t}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-fg-dim">{l.d}</p>
              </motion.div>
            ))}
          </div>

          <motion.div {...fade(0.1)} className="mt-6 border border-border-2 bg-surface/20 p-4 text-center">
            <span className="text-[11px] tracking-widest text-fg-dim">
              SIGNAL <span className="text-cyan">→</span> L1 ENSEMBLE <span className="text-cyan">→</span> L2 MEMORY <span className="text-cyan">→</span> L3 PANEL <span className="text-cyan">→</span> L4 VETO <span className="text-cyan">→</span> HASH-COMMIT <span className="text-cyan">→</span> EXECUTE
            </span>
          </motion.div>
        </div>
      </section>

      {/* ─── LIVE PROOF / SCOREBOARD TEASER ────────────────────────── */}
      <section className="relative border-t border-border-2">
        <div className="mx-auto max-w-6xl px-6 pt-24">
          <motion.div {...fade(0)} className="mb-4 max-w-2xl">
            <p className="mb-3 text-[11px] tracking-[0.35em] text-cyan/80">03 — LIVE PROOF</p>
            <h2 className="font-serif text-4xl text-fg" style={{ fontFamily: "var(--font-serif)" }}>
              The scoreboard is the proof.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-fg-dim">
              Signals every 15 minutes, around the clock, across crypto, US equities
              and memecoins. Positions tracked with live stops and targets. Skills
              re-optimized nightly. All of it verifiable, none of it editable.
            </p>
          </motion.div>
        </div>
        <ScoreboardTeaser />
      </section>

      {/* ─── FOOTER ────────────────────────────────────────────────── */}
      <footer className="border-t border-border-2 px-6 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-3">
            <QedMark size={22} />
            <span className="text-[11px] tracking-widest text-fg-dim">
              QED · QUOD ERAT DEMONSTRANDUM
            </span>
          </div>
          <nav className="flex gap-6 text-[11px] tracking-widest text-fg-dim">
            <Link className="hover:text-fg" href="/scoreboard">SCOREBOARD</Link>
            <Link className="hover:text-fg" href="/positions">POSITIONS</Link>
            <Link className="hover:text-fg" href="/hire">HIRE</Link>
            <Link className="hover:text-fg" href="/admin">ADMIN</Link>
          </nav>
          <span className="text-[10px] text-fg-mute">
            Paper trading only. Not investment advice. ∎
          </span>
        </div>
      </footer>
    </main>
  );
}
