"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid credentials.");
    } else {
      router.push(callbackUrl);
    }
  };

  return (
    <main className="hud-scanlines relative flex min-h-screen items-center justify-center bg-bg">
      <div className="hud-grid absolute inset-0 opacity-30" />
      <div className="relative z-10 w-full max-w-sm px-6">
        <div className="mb-8 text-center">
          <div className="mb-2 font-mono text-[11px] tracking-widest text-fg-mute">QED PROOF ENGINE</div>
          <h1
            className="font-serif text-3xl text-fg"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Admin Access
          </h1>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-[10px] tracking-widest text-fg-mute">EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full border border-border bg-surface/40 px-3 py-2.5 font-mono text-sm text-fg outline-none placeholder:text-fg-mute focus:border-cyan"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] tracking-widest text-fg-mute">PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-border bg-surface/40 px-3 py-2.5 font-mono text-sm text-fg outline-none placeholder:text-fg-mute focus:border-cyan"
            />
          </div>

          {error && (
            <div className="border border-danger/40 bg-danger/5 px-3 py-2 text-[12px] text-danger">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full border border-cyan bg-cyan/10 py-2.5 text-[11px] tracking-widest text-cyan transition-colors hover:bg-cyan/20 disabled:opacity-50"
          >
            {loading ? "SIGNING IN…" : "SIGN IN"}
          </button>
        </form>

        <p className="mt-6 text-center text-[10px] text-fg-mute">
          Set <span className="text-fg">ADMIN_EMAIL</span> and{" "}
          <span className="text-fg">ADMIN_PASSWORD</span> in your environment variables.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
