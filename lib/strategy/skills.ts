import type { Bar } from "../market/data";
import type { SignalAction } from "../ledger/schema";

/**
 * Strategy "skills": real, indicator-based decision rules. Each skill reads a
 * window of real OHLC bars and returns a decision for the latest bar (or null
 * for "no signal"). These are the modules we "load onto" each bot — the bot's
 * trading logic is exactly the skill(s) assigned to it.
 *
 * Deterministic and inspectable on purpose: the signal a bot emits can always
 * be re-derived from the same real bars, which is what makes the forward track
 * record verifiable rather than hand-wavy.
 */

export interface SkillResult {
  action: SignalAction;
  confidence: number; // 0..1
  rationale: string;
}

export interface Skill {
  id: string;
  label: string;
  /** Plain-language description of the edge — shown on the bot's profile. */
  blurb: string;
  /** Minimum bars needed to evaluate. */
  lookback: number;
  evaluate: (bars: Bar[], params?: Record<string, number>) => SkillResult | null;
}

// ─── indicator helpers ──────────────────────────────────────────────────

const closes = (b: Bar[]) => b.map((x) => x.c);

function sma(values: number[], n: number): number {
  if (values.length < n) return NaN;
  return values.slice(-n).reduce((a, c) => a + c, 0) / n;
}

function ema(values: number[], n: number): number {
  if (values.length < n) return NaN;
  const k = 2 / (n + 1);
  let e = sma(values.slice(0, n), n);
  for (let i = n; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(values: number[], n = 14): number {
  if (values.length < n + 1) return NaN;
  let gain = 0;
  let loss = 0;
  for (let i = values.length - n; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  if (loss === 0) return 100;
  const rs = gain / n / (loss / n);
  return 100 - 100 / (1 + rs);
}

function stdev(values: number[], n: number): number {
  if (values.length < n) return NaN;
  const w = values.slice(-n);
  const m = w.reduce((a, c) => a + c, 0) / n;
  return Math.sqrt(w.reduce((a, c) => a + (c - m) ** 2, 0) / n);
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// ─── skills ─────────────────────────────────────────────────────────────

export const SKILLS: Record<string, Skill> = {
  sma_cross: {
    id: "sma_cross",
    label: "SMA Trend Cross",
    blurb: "Goes long when the fast moving average crosses above the slow one (trend following).",
    lookback: 60,
    evaluate(bars, p = {}) {
      const c = closes(bars);
      const fast = p.fast ?? 20;
      const slow = p.slow ?? 50;
      const f = sma(c, fast);
      const s = sma(c, slow);
      if (isNaN(f) || isNaN(s)) return null;
      const spread = (f - s) / s;
      if (Math.abs(spread) < 0.002) return null;
      return {
        action: spread > 0 ? "BUY" : "SELL",
        confidence: clamp01(Math.abs(spread) * 12),
        rationale: `SMA${fast} ${spread > 0 ? "above" : "below"} SMA${slow} by ${(spread * 100).toFixed(1)}%`,
      };
    },
  },

  rsi_reversion: {
    id: "rsi_reversion",
    label: "RSI Mean Reversion",
    blurb: "Buys oversold (RSI<30) and sells overbought (RSI>70) — fades extremes.",
    lookback: 20,
    evaluate(bars, p = {}) {
      const c = closes(bars);
      const r = rsi(c, p.period ?? 14);
      if (isNaN(r)) return null;
      const lo = p.low ?? 30;
      const hi = p.high ?? 70;
      if (r <= lo) return { action: "BUY", confidence: clamp01((lo - r) / 20 + 0.4), rationale: `RSI ${r.toFixed(0)} oversold` };
      if (r >= hi) return { action: "SELL", confidence: clamp01((r - hi) / 20 + 0.4), rationale: `RSI ${r.toFixed(0)} overbought` };
      return null;
    },
  },

  momentum_12_1: {
    id: "momentum_12_1",
    label: "Momentum (12-1)",
    blurb: "Classic cross-sectional momentum: rides assets up over the trailing window.",
    lookback: 130,
    evaluate(bars, p = {}) {
      const c = closes(bars);
      const look = p.look ?? 120;
      if (c.length < look + 5) return null;
      const past = c[c.length - look];
      const now = c[c.length - 1];
      const ret = (now - past) / past;
      if (Math.abs(ret) < 0.05) return null;
      return {
        action: ret > 0 ? "BUY" : "SELL",
        confidence: clamp01(Math.abs(ret) * 2),
        rationale: `${(ret * 100).toFixed(0)}% over ${look}d`,
      };
    },
  },

  donchian_breakout: {
    id: "donchian_breakout",
    label: "Donchian Breakout",
    blurb: "Buys new N-day highs, shorts new N-day lows (turtle-style breakout).",
    lookback: 60,
    evaluate(bars, p = {}) {
      const n = p.n ?? 40;
      if (bars.length < n + 1) return null;
      const w = bars.slice(-n - 1, -1);
      const hi = Math.max(...w.map((b) => b.h));
      const lo = Math.min(...w.map((b) => b.l));
      const last = bars[bars.length - 1].c;
      if (last >= hi) return { action: "BUY", confidence: 0.7, rationale: `${n}d breakout high` };
      if (last <= lo) return { action: "SHORT", confidence: 0.6, rationale: `${n}d breakdown low` };
      return null;
    },
  },

  bollinger_squeeze: {
    id: "bollinger_squeeze",
    label: "Bollinger Squeeze",
    blurb: "Trades expansion out of a low-volatility band squeeze.",
    lookback: 40,
    evaluate(bars, p = {}) {
      const c = closes(bars);
      const n = p.n ?? 20;
      const m = sma(c, n);
      const sd = stdev(c, n);
      if (isNaN(m) || isNaN(sd) || sd === 0) return null;
      const last = c[c.length - 1];
      const z = (last - m) / sd;
      if (z > 2) return { action: "BUY", confidence: clamp01((z - 2) / 1.5 + 0.4), rationale: `+${z.toFixed(1)}σ band break` };
      if (z < -2) return { action: "BUY", confidence: clamp01((-z - 2) / 1.5 + 0.4), rationale: `${z.toFixed(1)}σ snap-back buy` };
      return null;
    },
  },

  macd_cross: {
    id: "macd_cross",
    label: "MACD Cross",
    blurb: "Momentum via MACD line crossing its signal line.",
    lookback: 60,
    evaluate(bars) {
      const c = closes(bars);
      if (c.length < 35) return null;
      // MACD line series, then its 9-EMA signal line.
      const macdSeries: number[] = [];
      for (let i = 26; i <= c.length; i++) {
        const w = c.slice(0, i);
        macdSeries.push(ema(w, 12) - ema(w, 26));
      }
      if (macdSeries.length < 10) return null;
      const macdNow = macdSeries[macdSeries.length - 1];
      const sig = ema(macdSeries, 9);
      if (isNaN(macdNow) || isNaN(sig)) return null;
      const hist = macdNow - sig;
      if (Math.abs(hist) < 1e-4) return null;
      return {
        action: hist > 0 ? "BUY" : "SELL",
        confidence: clamp01(Math.abs(hist) / (Math.abs(macdNow) + 1e-9)),
        rationale: `MACD ${hist > 0 ? "above" : "below"} signal line`,
      };
    },
  },

  gap_go: {
    id: "gap_go",
    label: "Gap & Go",
    blurb: "Buys strong upside gaps with follow-through volume.",
    lookback: 30,
    evaluate(bars) {
      if (bars.length < 21) return null;
      const last = bars[bars.length - 1];
      const prev = bars[bars.length - 2];
      const gap = (last.o - prev.c) / prev.c;
      const avgVol = sma(bars.slice(-21, -1).map((b) => b.v), 20);
      const volPop = avgVol > 0 ? last.v / avgVol : 1;
      if (gap > 0.03 && volPop > 1.2 && last.c > last.o) {
        return { action: "BUY", confidence: clamp01(gap * 8 + (volPop - 1) * 0.2), rationale: `+${(gap * 100).toFixed(1)}% gap, ${volPop.toFixed(1)}× vol` };
      }
      return null;
    },
  },

  trend_pullback: {
    id: "trend_pullback",
    label: "Trend Pullback",
    blurb: "Buys dips to the rising 50-day MA within an uptrend.",
    lookback: 60,
    evaluate(bars) {
      const c = closes(bars);
      const ma50 = sma(c, 50);
      const ma50prev = sma(c.slice(0, -10), 50);
      if (isNaN(ma50) || isNaN(ma50prev)) return null;
      const last = c[c.length - 1];
      const uptrend = ma50 > ma50prev;
      const dist = (last - ma50) / ma50;
      if (uptrend && dist > -0.02 && dist < 0.03) {
        return { action: "BUY", confidence: clamp01(0.5 + (0.03 - Math.abs(dist)) * 10), rationale: `pullback to rising MA50` };
      }
      return null;
    },
  },
  vwap_reversion: {
    id: "vwap_reversion",
    label: "VWAP Reversion",
    blurb: "Fades stretched moves away from the volume-weighted average price.",
    lookback: 30,
    evaluate(bars, p = {}) {
      const n = p.n ?? 20;
      if (bars.length < n + 1) return null;
      const w = bars.slice(-n);
      let pv = 0;
      let vol = 0;
      for (const b of w) {
        const typical = (b.h + b.l + b.c) / 3;
        pv += typical * b.v;
        vol += b.v;
      }
      if (vol === 0) return null;
      const vwap = pv / vol;
      const last = w[w.length - 1].c;
      const dev = (last - vwap) / vwap;
      const band = p.band ?? 0.02; // 2% stretch triggers a fade
      if (dev <= -band) return { action: "BUY", confidence: clamp01(Math.abs(dev) / band * 0.4 + 0.3), rationale: `${(dev * 100).toFixed(1)}% below VWAP — snap-back buy` };
      if (dev >= band) return { action: "SELL", confidence: clamp01(dev / band * 0.4 + 0.3), rationale: `+${(dev * 100).toFixed(1)}% above VWAP — fade` };
      return null;
    },
  },

  volume_breakout: {
    id: "volume_breakout",
    label: "Volume Breakout",
    blurb: "Buys range breaks confirmed by a surge in volume — no volume, no trade.",
    lookback: 40,
    evaluate(bars, p = {}) {
      const n = p.n ?? 30;
      if (bars.length < n + 2) return null;
      const w = bars.slice(-n - 1, -1);
      const last = bars[bars.length - 1];
      const hi = Math.max(...w.map((b) => b.h));
      const lo = Math.min(...w.map((b) => b.l));
      const avgVol = w.reduce((a, b) => a + b.v, 0) / w.length;
      const volPop = avgVol > 0 ? last.v / avgVol : 0;
      const minPop = p.minPop ?? 1.5;
      if (volPop < minPop) return null; // breakout without volume = trap
      if (last.c > hi) return { action: "BUY", confidence: clamp01(0.45 + (volPop - minPop) * 0.15), rationale: `range break +vol ${volPop.toFixed(1)}×` };
      if (last.c < lo) return { action: "SHORT", confidence: clamp01(0.4 + (volPop - minPop) * 0.15), rationale: `range breakdown +vol ${volPop.toFixed(1)}×` };
      return null;
    },
  },

  multi_tf_confirm: {
    id: "multi_tf_confirm",
    label: "Multi-TF Confirm",
    blurb: "Short-term momentum only taken in the direction of the higher-timeframe trend (4× aggregated bars).",
    lookback: 80,
    evaluate(bars, p = {}) {
      if (bars.length < 80) return null;
      const c = closes(bars);
      // Higher timeframe: aggregate every 4 bars into one
      const htfCloses: number[] = [];
      for (let i = bars.length % 4; i + 4 <= bars.length; i += 4) {
        htfCloses.push(bars[i + 3].c);
      }
      if (htfCloses.length < 12) return null;
      const htfFast = sma(htfCloses, p.htfFast ?? 5);
      const htfSlow = sma(htfCloses, p.htfSlow ?? 10);
      if (isNaN(htfFast) || isNaN(htfSlow)) return null;
      const htfTrend = htfFast > htfSlow ? 1 : -1;
      // Lower timeframe trigger: short momentum
      const look = p.look ?? 12;
      const ltfRet = (c[c.length - 1] - c[c.length - look]) / c[c.length - look];
      if (Math.abs(ltfRet) < 0.005) return null;
      const ltfDir = ltfRet > 0 ? 1 : -1;
      if (ltfDir !== htfTrend) return null; // trigger against the tide → skip
      return {
        action: htfTrend > 0 ? "BUY" : "SELL",
        confidence: clamp01(0.45 + Math.abs(ltfRet) * 8),
        rationale: `HTF trend ${htfTrend > 0 ? "up" : "down"} + LTF momentum aligned (${(ltfRet * 100).toFixed(1)}%)`,
      };
    },
  },
};

export const SKILL_IDS = Object.keys(SKILLS);
