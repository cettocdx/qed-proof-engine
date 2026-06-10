/**
 * QED brand lockup.
 *
 * QED — quod erat demonstrandum: the words a mathematician writes when the
 * proof is complete. The mark is the Halmos tombstone (∎), the end-of-proof
 * symbol, drawn as a hash-chained stack: two linked outline blocks settling
 * into the final, solid block — the proof closing.
 */
export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <QedMark size={28} />
      <span className="flex items-baseline gap-2">
        <span
          className="font-serif text-2xl tracking-tight text-fg"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          QED
        </span>
        <span className="hidden text-[9px] tracking-[0.3em] text-fg-dim sm:inline">
          EVERY TRADE, PROVEN
        </span>
      </span>
    </div>
  );
}

/** The ∎ mark alone — usable as favicon-scale glyph or large hero emblem. */
export function QedMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={`text-cyan ${className}`}
    >
      {/* chain links — prior blocks of the ledger, fading back in time */}
      <rect x="2" y="2" width="9" height="9" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <rect x="8" y="8" width="9" height="9" stroke="currentColor" strokeWidth="1.5" opacity="0.65" />
      {/* the tombstone ∎ — the proof, closed and solid */}
      <rect x="14" y="14" width="16" height="16" fill="currentColor" />
      {/* hash tick inside the final block */}
      <path d="M18 22 L21 25 L26 18" stroke="#020617" strokeWidth="2" fill="none" strokeLinecap="square" />
    </svg>
  );
}
