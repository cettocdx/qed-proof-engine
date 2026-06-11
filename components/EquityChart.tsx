"use client";

import { useRef, useState } from "react";

/**
 * Interactive equity sparkline — hover to inspect any point.
 * Values are absolute dollars (the bot's $100k book marked signal by signal).
 */
export default function EquityChart({
  curve,
  height = 64,
}: {
  curve: number[];
  height?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const W = 560;
  const H = height;
  const PAD = 4;

  if (curve.length < 2) {
    return (
      <div className="flex h-16 items-center justify-center border border-border/60 bg-surface/20 text-[10px] text-fg-mute">
        no equity data yet — builds with the first signals
      </div>
    );
  }

  const min = Math.min(...curve);
  const max = Math.max(...curve);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (curve.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);

  const path = curve.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = curve[curve.length - 1] >= curve[0];
  const color = up ? "#22c55e" : "#ef4444";

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD) / (W - PAD * 2)) * (curve.length - 1));
    setHover(Math.min(curve.length - 1, Math.max(0, i)));
  };

  const hv = hover != null ? curve[hover] : null;

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full cursor-crosshair"
        style={{ height: H }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* baseline at $100k */}
        {min < 100_000 && max > 100_000 && (
          <line x1={PAD} x2={W - PAD} y1={y(100_000)} y2={y(100_000)} stroke="#334155" strokeDasharray="3 4" strokeWidth="1" />
        )}
        {/* area fill */}
        <path d={`${path} L${x(curve.length - 1)},${H - PAD} L${x(0)},${H - PAD} Z`} fill={color} opacity="0.08" />
        <path d={path} fill="none" stroke={color} strokeWidth="1.6" />
        {/* hover crosshair + dot */}
        {hover != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD} y2={H - PAD} stroke="#22d3ee" strokeWidth="1" opacity="0.5" />
            <circle cx={x(hover)} cy={y(curve[hover])} r="3.5" fill="#22d3ee" stroke="#020617" strokeWidth="1.5" />
          </>
        )}
      </svg>
      {/* tooltip */}
      {hv != null && hover != null && (
        <div
          className="pointer-events-none absolute -top-7 z-10 -translate-x-1/2 whitespace-nowrap border border-border-2 bg-surface px-2 py-0.5 text-[10px] tabular text-fg"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          ${hv.toLocaleString()}
          <span className={hv >= 100_000 ? "text-green" : "text-danger"}>
            {" "}({hv >= 100_000 ? "+" : ""}{(((hv - 100_000) / 100_000) * 100).toFixed(1)}%)
          </span>
          <span className="text-fg-mute"> · signal #{hover}</span>
        </div>
      )}
    </div>
  );
}
