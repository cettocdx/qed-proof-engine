"use client";

import { useState } from "react";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";

type Sub = { agentId: string; createdAt: string; expiresAt: string; active: boolean };

export default function AccountPage() {
  const [email, setEmail] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await res.json() as { subscriptions?: Sub[] };
      setSubs(d.subscriptions ?? []);
    } catch {
      setError("Network error — try again.");
    }
    setLoading(false);
  };

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessKey }),
      });
      if (!res.ok) {
        setError("Invalid or expired access key.");
      } else {
        setUnlocked(true);
      }
    } catch {
      setError("Network error — try again.");
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-bg px-6 py-10 font-mono">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8"><SiteNav /></div>
        <h1 className="font-serif text-3xl text-fg" style={{ fontFamily: "var(--font-serif)" }}>
          My Subscriptions
        </h1>
        <p className="mt-2 text-[12px] text-fg-dim">
          Look up your agent subscriptions by email, or activate this device with your access key.
        </p>

        {/* unlock with key */}
        <div className="mt-8 border border-border bg-surface/20 p-5">
          <div className="mb-2 text-[10px] tracking-widest text-fg-mute">ACTIVATE THIS DEVICE</div>
          {unlocked ? (
            <div className="border border-green/40 bg-green/5 px-3 py-2 text-[12px] text-green">
              ✓ Device activated — subscriber content is now unlocked.{" "}
              <Link href="/scoreboard" className="underline">Open scoreboard</Link>
            </div>
          ) : (
            <form onSubmit={unlock} className="flex gap-1">
              <input
                type="text"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                placeholder="qed_… (access key from your purchase)"
                className="min-w-0 flex-1 border border-border bg-bg px-3 py-2 text-[11px] text-fg outline-none placeholder:text-fg-mute focus:border-cyan"
              />
              <button
                type="submit"
                disabled={loading || !accessKey.trim()}
                className="border border-cyan/60 bg-cyan/10 px-4 py-2 text-[10px] tracking-widest text-cyan hover:bg-cyan/20 disabled:opacity-40"
              >
                UNLOCK
              </button>
            </form>
          )}
        </div>

        {/* lookup by email */}
        <div className="mt-4 border border-border bg-surface/20 p-5">
          <div className="mb-2 text-[10px] tracking-widest text-fg-mute">LOOK UP BY EMAIL</div>
          <form onSubmit={lookup} className="flex gap-1">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="min-w-0 flex-1 border border-border bg-bg px-3 py-2 text-[11px] text-fg outline-none placeholder:text-fg-mute focus:border-cyan"
            />
            <button
              type="submit"
              disabled={loading}
              className="border border-border-2 px-4 py-2 text-[10px] tracking-widest text-fg-dim hover:border-fg-dim hover:text-fg disabled:opacity-40"
            >
              {loading ? "…" : "SEARCH"}
            </button>
          </form>

          {subs !== null && (
            <div className="mt-4">
              {subs.length === 0 ? (
                <p className="text-[12px] text-fg-dim">
                  No subscriptions found for this email.{" "}
                  <Link href="/hire" className="text-cyan hover:underline">Hire an agent →</Link>
                </p>
              ) : (
                <div className="divide-y divide-border/50 border border-border/60">
                  {subs.map((s, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 text-[12px]">
                      <Link href={`/strategy/${s.agentId}`} className="text-fg hover:text-cyan">{s.agentId}</Link>
                      <span className="text-[10px] text-fg-mute tabular">until {s.expiresAt.slice(0, 10)}</span>
                      {s.active ? (
                        <span className="border border-green/40 px-1.5 py-0.5 text-[9px] tracking-widest text-green">ACTIVE</span>
                      ) : (
                        <Link href="/hire" className="border border-amber/40 px-1.5 py-0.5 text-[9px] tracking-widest text-amber hover:bg-amber/10">
                          EXPIRED — RENEW
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {error && <div className="mt-3 text-[12px] text-danger">{error}</div>}

        <p className="mt-6 text-[10px] text-fg-mute">
          Lost your access key? Email{" "}
          <span className="text-fg">support@qed.llc</span> from your purchase address.
        </p>
      </div>
    </main>
  );
}
