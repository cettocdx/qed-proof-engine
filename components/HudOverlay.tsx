"use client";

import { useEffect, useState } from "react";

/** Corner registration mark (┌ ┐ └ ┘ style brackets). */
function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const base = "absolute h-5 w-5 border-cyan/50";
  const map = {
    tl: "top-5 left-5 border-l border-t",
    tr: "top-5 right-5 border-r border-t",
    bl: "bottom-5 left-5 border-l border-b",
    br: "bottom-5 right-5 border-r border-b",
  } as const;
  return <div className={`${base} ${map[pos]}`} aria-hidden />;
}

/** Faux live telemetry line — sells the "running system" feel. */
function Telemetry() {
  const [t, setT] = useState("00:00:00");
  const [lat, setLat] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setT(d.toISOString().slice(11, 19));
      setLat(8 + Math.round(Math.random() * 14));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-5 text-[11px] tracking-widest text-fg-dim tabular">
      <span className="flex items-center gap-1.5">
        <span className="blink inline-block h-1.5 w-1.5 rounded-full bg-green" />
        <span className="text-green">SYS.OK</span>
      </span>
      <span>UTC {t}</span>
      <span>LAT {lat}ms</span>
      <span className="hidden sm:inline">NODE&nbsp;us-east-1</span>
      <span className="hidden md:inline text-cyan/70">データストリーム</span>
    </div>
  );
}

export default function HudOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <Corner pos="tl" />
      <Corner pos="tr" />
      <Corner pos="bl" />
      <Corner pos="br" />

      {/* center crosshair */}
      <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 opacity-30">
        <div className="relative h-8 w-8">
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-cyan/60" />
          <div className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-cyan/60" />
        </div>
      </div>

      {/* top edge ticks + label — pushed below the nav bar */}
      <div className="absolute left-5 right-5 top-24 flex items-center justify-between text-[10px] tracking-[0.25em] text-fg-mute">
        <span>QED / PROOF-ENGINE</span>
        <span>REV 1.0 ∎</span>
      </div>

      {/* bottom telemetry bar */}
      <div className="absolute left-5 right-5 bottom-11">
        <Telemetry />
      </div>

      {/* slow scan sweep */}
      <div className="sweep absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan/40 to-transparent" />
    </div>
  );
}
