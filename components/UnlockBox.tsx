"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Premium gate — enter the access key delivered after payment.
 * On success the key is stored in an httpOnly cookie and the page reloads.
 */
export default function UnlockBox({ agentId }: { agentId: string }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessKey: key }),
      });
      if (!res.ok) {
        setError("Invalid or expired access key.");
        setLoading(false);
        return;
      }
      window.location.reload();
    } catch {
      setError("Network error — try again.");
      setLoading(false);
    }
  };

  return (
    <div className="border-t border-border/60 bg-bg/60 px-4 py-6 text-center">
      <div className="text-[11px] tracking-widest text-amber">🔒 SUBSCRIBER CONTENT</div>
      <p className="mx-auto mt-2 max-w-md text-[11px] leading-relaxed text-fg-dim">
        Full trade history is available to subscribers. Hire this agent to receive an
        access key, or enter yours below.
      </p>
      <form onSubmit={submit} className="mx-auto mt-4 flex max-w-sm gap-1">
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="qed_…"
          className="min-w-0 flex-1 border border-border bg-surface/40 px-3 py-2 font-mono text-[11px] text-fg outline-none placeholder:text-fg-mute focus:border-cyan"
        />
        <button
          type="submit"
          disabled={loading || !key.trim()}
          className="border border-cyan/60 bg-cyan/10 px-4 py-2 text-[10px] tracking-widest text-cyan hover:bg-cyan/20 disabled:opacity-40"
        >
          {loading ? "…" : "UNLOCK"}
        </button>
      </form>
      {error && <div className="mt-2 text-[11px] text-danger">{error}</div>}
      <div className="mt-4 text-[10px] text-fg-mute">
        No key yet?{" "}
        <Link href={`/hire`} className="text-cyan hover:underline">Hire {agentId}</Link>
        {" · "}
        <Link href="/account" className="text-cyan hover:underline">My subscriptions</Link>
      </div>
    </div>
  );
}
