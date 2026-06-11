import Link from "next/link";
import Wordmark from "./Wordmark";

/**
 * Shared site navigation — one consistent header across every page.
 * `active` highlights the current section.
 */
const LINKS = [
  { href: "/scoreboard", label: "SCOREBOARD" },
  { href: "/positions", label: "POSITIONS" },
  { href: "/hire", label: "HIRE" },
  { href: "/verify", label: "VERIFY" },
] as const;

export default function SiteNav({ active = "" }: { active?: string }) {
  return (
    <header className="flex flex-col gap-4 border-b border-border-2 pb-5 sm:flex-row sm:items-center sm:justify-between">
      <Link href="/" className="transition-opacity hover:opacity-80">
        <Wordmark />
      </Link>
      <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] tracking-widest">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={
              active === l.href
                ? "border-b border-cyan pb-0.5 text-cyan"
                : "text-fg-dim transition-colors hover:text-fg"
            }
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
