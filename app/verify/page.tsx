"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";

type VerifyResult = {
  id: string;
  name: string;
  market: string;
  archetype: string;
  thesis: string;
  commit: { seq: number; ts: string; hash: string; prevHash: string };
  chain: { ok: boolean; brokenAt: number | null };
  signalCount: number;
  liveDays: number;
  status: "LIVE" | "INCUB" | "BACKTEST";
  totalReturnPct: number | null;
  entries: { seq: number; ts: string; action: string; symbol: string; hash: string; prevHash: string }[];
};

type Suggestion = { id: string; name: string };

export default function VerifyPage() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load all strategy IDs for autocomplete
  useEffect(() => {
    fetch("/api/verify")
      .then((r) => r.json() as Promise<{ ids: Suggestion[] }>)
      .then((d) => setSuggestions(d.ids ?? []))
      .catch(() => {});
  }, []);

  const filtered = query.length >= 2
    ? suggestions.filter(
        (s) =>
          s.id.includes(query.toUpperCase()) ||
          s.name.toLowerCase().includes(query.toLowerCase()),
      )
    : [];

  const verify = async (id: string) => {
    setQuery(id);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch(`/api/verify?id=${encodeURIComponent(id)}`);
      const d = await r.json() as VerifyResult & { error?: string };
      if (!r.ok || d.error) { setError(d.error ?? "Unknown error"); }
      else setResult(d);
    } catch {
      setError("Network error — could not reach the ledger.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) verify(query.trim());
  };

  const STATUS_COLOR = {
    LIVE: "text-green border-green/40 bg-green/5",
    INCUB: "text-amber border-amber/40 bg-amber/5",
    BACKTEST: "text-fg-dim border-border-2",
  } as const;

  return (
    <main className="hud-scanlines relative min-h-screen bg-bg">
      <div className="hud-grid absolute inset-0 opacity-40" />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8"><SiteNav active="/verify" /></div>

        {/* hero */}
        <div className="mb-10">
          <h1 className="font-serif text-4xl text-fg sm:text-5xl" style={{ fontFamily: "var(--font-serif)" }}>
            Chain Verification
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-fg-dim">
            Every signal QED emits is sealed into an append-only, SHA-256 hash chain.
            Enter any strategy ID below to independently verify that its signal history
            has never been altered. No trust required — the math speaks.
          </p>
        </div>

        {/* search */}
        <form onSubmit={handleSubmit} className="relative mb-2">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setResult(null); setError(null); }}
              placeholder="AGT-024 or type a name…"
              className="flex-1 border border-border bg-surface/40 px-4 py-3 font-mono text-sm text-fg outline-none placeholder:text-fg-mute focus:border-cyan"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="border border-cyan/50 bg-cyan/10 px-6 py-3 text-[11px] tracking-widest text-cyan hover:bg-cyan/20 disabled:opacity-40"
            >
              {loading ? "CHECKING…" : "VERIFY"}
            </button>
          </div>

          {/* autocomplete dropdown */}
          {filtered.length > 0 && !result && (
            <div className="absolute left-0 right-16 top-full z-20 border border-border bg-surface shadow-lg">
              {filtered.slice(0, 8).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => verify(s.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[12px] hover:bg-surface/80"
                >
                  <span className="text-cyan/70 tabular">{s.id}</span>
                  <span className="text-fg">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </form>

        <p className="mb-8 text-[10px] text-fg-mute">
          Try: AGT-001, AGT-007, AGT-024 — or start typing a name
        </p>

        {/* error */}
        {error && (
          <div className="mb-6 border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* result */}
        {result && (
          <div className="space-y-4">
            {/* chain verdict — the headline */}
            <div className={`flex items-center gap-4 border p-5 ${result.chain.ok ? "border-green/40 bg-green/5" : "border-danger/40 bg-danger/5"}`}>
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-xl ${result.chain.ok ? "border-green text-green" : "border-danger text-danger"}`}>
                {result.chain.ok ? "✓" : "✗"}
              </div>
              <div>
                <div className={`text-lg tracking-widest ${result.chain.ok ? "text-green" : "text-danger"}`}>
                  {result.chain.ok ? "CHAIN INTACT — all hashes verified" : `CHAIN TAMPERED — broken at entry #${result.chain.brokenAt}`}
                </div>
                <div className="mt-1 text-[11px] text-fg-dim">
                  {result.chain.ok
                    ? `Every signal in ${result.name}'s history has been independently re-hashed from genesis. No alterations detected.`
                    : "One or more entries have been modified after commitment. The chain is no longer trustworthy from this point."}
                </div>
              </div>
            </div>

            {/* strategy summary */}
            <div className="border border-border bg-surface/30 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] tracking-widest text-fg-mute">
                <span className="text-fg">{result.id}</span>
                <span className={`rounded-sm border px-1.5 py-0.5 ${STATUS_COLOR[result.status]}`}>{result.status}</span>
                <span className="text-cyan/70">{result.market}</span>
                <span>{result.archetype.toUpperCase()}</span>
              </div>
              <div className="mb-2 text-xl text-fg">{result.name}</div>
              <p className="text-[12px] leading-relaxed text-fg-dim">{result.thesis}</p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px]">
                <span className="text-fg-mute">Signals: <span className="text-fg">{result.signalCount}</span></span>
                <span className="text-fg-mute">Live days: <span className="text-fg">{result.liveDays > 0 ? `${result.liveDays}d` : "—"}</span></span>
                {result.totalReturnPct !== null && (
                  <span className="text-fg-mute">Return: <span className={result.totalReturnPct >= 0 ? "text-green" : "text-danger"}>{result.totalReturnPct >= 0 ? "+" : ""}{result.totalReturnPct}%</span></span>
                )}
              </div>
            </div>

            {/* commitment block */}
            <div className="border border-cyan/25 bg-surface/30 p-4">
              <div className="mb-3 text-[10px] tracking-widest text-cyan/80">GENESIS COMMITMENT — sealed before first signal</div>
              <div className="space-y-2 text-[11px]">
                <Row k="commit seq" v={String(result.commit.seq)} />
                <Row k="committed at" v={result.commit.ts} />
                <Row k="prev hash" v={result.commit.prevHash} dim />
                <Row k="commit hash" v={result.commit.hash} accent />
              </div>
            </div>

            {/* signal entries */}
            {result.entries.length > 0 && (
              <div className="border border-border bg-surface/30">
                <div className="flex items-center justify-between border-b border-border px-4 py-2 text-[10px] tracking-widest text-fg-mute">
                  <span>SIGNAL CHAIN — {result.entries.length} entries</span>
                  <span>each entry seals the previous hash</span>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
                  {[...result.entries].reverse().map((e) => (
                    <div key={e.seq} className="grid grid-cols-[40px_140px_52px_80px_1fr] gap-2 px-4 py-2 text-[11px]">
                      <span className="text-fg-mute tabular">#{e.seq}</span>
                      <span className="text-fg-dim tabular">{e.ts.slice(0, 10)} {e.ts.slice(11, 16)}</span>
                      <span className={e.action === "BUY" || e.action === "COVER" ? "text-green" : e.action === "SELL" || e.action === "SHORT" ? "text-danger" : "text-fg-mute"}>
                        {e.action}
                      </span>
                      <span className="text-fg">{e.symbol}</span>
                      <span className="truncate text-cyan/50 tabular">{e.hash.slice(0, 20)}…</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* how to verify independently */}
            <div className="border border-border/50 bg-surface/20 p-4 text-[11px] leading-relaxed text-fg-dim">
              <div className="mb-1 text-[10px] tracking-widest text-fg-mute">HOW TO VERIFY INDEPENDENTLY</div>
              Download the raw ledger and re-hash from genesis:<br />
              <span className="mt-1 block font-mono text-fg">npx tsx scripts/verify-ledger.ts</span>
              <span className="block mt-1">
                Any edit to any entry — even a single character — changes its hash and breaks the chain from that point forward.
                The verification is deterministic: same input always produces the same hash.
              </span>
              <Link href={`/strategy/${result.id}`} className="mt-2 block text-cyan/70 hover:text-cyan">
                → View full dossier for {result.id}
              </Link>
            </div>
          </div>
        )}

        {/* empty state */}
        {!result && !error && !loading && (
          <div className="border border-border/40 bg-surface/20 py-16 text-center">
            <div className="mb-2 text-3xl text-fg-mute">⛓</div>
            <div className="text-sm text-fg-dim">Enter a strategy ID to verify its signal chain</div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {suggestions.slice(0, 6).map((s) => (
                <button
                  key={s.id}
                  onClick={() => verify(s.id)}
                  className="border border-border px-3 py-1.5 text-[10px] tracking-widest text-fg-dim hover:border-cyan/40 hover:text-cyan"
                >
                  {s.id}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Row({ k, v, dim, accent }: { k: string; v: string; dim?: boolean; accent?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3">
      <span className="w-24 shrink-0 text-[10px] tracking-widest text-fg-mute">{k}</span>
      <span className={`break-all tabular ${accent ? "text-cyan" : dim ? "text-fg-mute" : "text-fg"}`}>{v}</span>
    </div>
  );
}
