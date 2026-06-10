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
  { href: "/admin", label: "ADMIN" },
] as const;

export default function SiteNav({ active = "" }: { active?: string }) {
  return (
    <header className="flex items-center justify-between border-b border-border-2 pb-5">
      <Link href="/" className="transition-opacity hover:opacity-80">
        <Wordmark />
      </Link>
      <nav className="flex items-center gap-6 text-[11px] tracking-widest">
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
