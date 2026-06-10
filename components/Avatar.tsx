/**
 * Deterministic geometric avatar from a seed string. Pure + server-safe.
 * A 5x5 symmetric identicon in the terminal palette — every bot gets a stable,
 * unique glyph with no image assets.
 */

const ACCENTS = ["#22d3ee", "#22c55e", "#f59e0b", "#a9f1ff", "#7dd3fc"];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export default function Avatar({
  seed,
  size = 40,
}: {
  seed: string;
  size?: number;
}) {
  const h = hash(seed);
  const accent = ACCENTS[h % ACCENTS.length];
  const cells = 5;
  const cell = size / cells;
  const rects: React.ReactElement[] = [];

  // build a horizontally-symmetric bit pattern
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < Math.ceil(cells / 2); x++) {
      const bit = (h >> ((y * 3 + x) % 31)) & 1;
      if (!bit) continue;
      for (const xx of [x, cells - 1 - x]) {
        rects.push(
          <rect
            key={`${xx}-${y}`}
            x={xx * cell}
            y={y * cell}
            width={cell}
            height={cell}
            fill={accent}
            opacity={(xx + y) % 2 === 0 ? 1 : 0.55}
          />,
        );
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 border border-border bg-bg"
      aria-hidden
    >
      {rects}
    </svg>
  );
}
