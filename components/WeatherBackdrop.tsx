"use client";

import { memo, useMemo } from "react";
import type { Condition } from "@/lib/weather";

interface Props {
  condition: Condition | null;
  isDay: boolean;
  /** Adds leaves, gusts and a kite on top of whatever the sky is doing. */
  windy?: boolean;
}

/** Deterministic PRNG so the same condition always lays out the same drops. */
function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

interface Drop {
  left: string;
  height: string;
  duration: string;
  delay: string;
  opacity: number;
  /** Horizontal drift in the keyframe — a little variance reads as wind, not scratches. */
  dx: string;
  width: string;
  blur: string;
}

interface Cloud {
  top: string;
  width: string;
  height: string;
  duration: string;
  delay: string;
  opacity: number;
  far: boolean;
}

const RAIN_COUNT: Partial<Record<Condition, number>> = {
  drizzle: 44,
  rain: 82,
  downpour: 132,
  thunder: 104,
};

function buildDrops(condition: Condition): Drop[] {
  const count = RAIN_COUNT[condition] ?? 0;
  if (!count) return [];
  const rand = seeded(condition.length * 977 + count);
  const heavy = condition === "downpour" || condition === "thunder";
  return Array.from({ length: count }, () => {
    const near = rand() < 0.12;
    return {
      left: `${(rand() * 100).toFixed(2)}%`,
      height: `${(near ? 110 + rand() * 90 : heavy ? 60 + rand() * 70 : 30 + rand() * 50).toFixed(0)}px`,
      duration: `${(near ? 0.55 + rand() * 0.3 : heavy ? 0.6 + rand() * 0.5 : 0.9 + rand() * 0.8).toFixed(2)}s`,
      delay: `${(rand() * 3).toFixed(2)}s`,
      opacity: near ? 0.45 + rand() * 0.3 : 0.18 + rand() * 0.32,
      dx: `-${(1 + rand() * 5).toFixed(2)}vw`,
      width: near ? "1.6px" : "1px",
      blur: near ? "0.6px" : "0px",
    };
  });
}

function buildClouds(condition: Condition): Cloud[] {
  // [near, far] — far ones sit behind, bigger and blurrier, at a slower speed.
  const counts: Partial<Record<Condition, [number, number]>> = {
    "mostly-clear": [1, 1],
    cloudy: [4, 2],
    overcast: [6, 4],
    rain: [3, 2],
    drizzle: [3, 2],
    downpour: [4, 2],
    thunder: [5, 3],
    fog: [2, 1],
  };
  const [near, far] = counts[condition] ?? [0, 0];
  const total = near + far;
  if (!total) return [];

  const rand = seeded(total * 613 + 41);
  const heavy = condition === "overcast" || condition === "thunder";

  return Array.from({ length: total }, (_, i) => {
    const isFar = i >= near;
    // Height in vw keeps a cloud's 2.5:1 aspect on any window height.
    const w = (isFar ? 26 : 15) + rand() * (isFar ? 14 : 11);
    return {
      top: `${4 + rand() * 66}%`,
      width: `${w.toFixed(1)}vw`,
      height: `${(w * 0.38).toFixed(1)}vw`,
      duration: `${95 + rand() * 85}s`,
      delay: `-${(i / total) * 90 + rand() * 20}s`,
      opacity: (heavy ? 0.55 : 0.45) + rand() * 0.2,
      far: isFar,
    };
  });
}

function buildMotes(): { left: string; top: string; duration: string; delay: string }[] {
  const rand = seeded(7919);
  return Array.from({ length: 18 }, () => ({
    left: `${(rand() * 100).toFixed(1)}%`,
    top: `${(28 + rand() * 62).toFixed(1)}%`,
    duration: `${9 + rand() * 12}s`,
    delay: `${(rand() * 14).toFixed(1)}s`,
  }));
}

interface Floater {
  top: string;
  size: string;
  duration: string;
  delay: string;
  opacity: number;
}

function buildLeaves(count: number, seed = 4231): Floater[] {
  const rand = seeded(seed);
  return Array.from({ length: count }, () => ({
    top: `${6 + rand() * 80}%`,
    size: `${19 + rand() * 13}px`,
    duration: `${5.5 + rand() * 6}s`,
    delay: `-${(rand() * 11).toFixed(1)}s`,
    opacity: 0.5 + rand() * 0.45,
  }));
}

function buildGusts(count: number): Floater[] {
  const rand = seeded(8877);
  return Array.from({ length: count }, () => ({
    top: `${8 + rand() * 78}%`,
    size: `${22 + rand() * 18}vw`,
    duration: `${2.6 + rand() * 2.4}s`,
    delay: `-${(rand() * 6).toFixed(1)}s`,
    opacity: 0.35 + rand() * 0.4,
  }));
}

function Kite() {
  return (
    <svg viewBox="0 0 90 140" width="72" height="112" aria-hidden="true">
      <path d="M45 6 74 44 45 82 16 44Z" fill="rgba(255, 122, 89, 0.92)" stroke="rgba(255,255,255,0.75)" strokeWidth="1.6" />
      <path d="M45 6v76M16 44h58" stroke="rgba(255,255,255,0.6)" strokeWidth="1.1" />
      <path d="M45 82c-5 16 7 24 1 40" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.6" />
      <path d="M45 96l-8 5 8 5 8-5Z" fill="rgba(126, 224, 255, 0.85)" />
      <path d="M44 112l-7 4 7 5 7-5Z" fill="rgba(255, 183, 3, 0.85)" />
    </svg>
  );
}

/** A cloud silhouette reads as a cloud; four soft circles just read as haze. */
function CloudShape({ opacity }: { opacity: number }) {
  return (
    <svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true">
      <g fill={`rgba(255,255,255,${(0.5 * Math.min(1, opacity)).toFixed(3)})`}>
        <circle cx="56" cy="58" r="29" />
        <circle cx="98" cy="44" r="37" />
        <circle cx="141" cy="56" r="26" />
        <rect x="27" y="58" width="146" height="30" rx="15" />
      </g>
      <g fill="rgba(196,212,236,0.16)">
        <rect x="27" y="74" width="146" height="14" rx="7" />
      </g>
    </svg>
  );
}

function Leaf() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="leafGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#cfe08a" />
          <stop offset="100%" stopColor="#4f7a2e" />
        </linearGradient>
      </defs>
      <path d="M12 2.5c8 4.5 8 13.5 0 19-8-5.5-8-14.5 0-19Z" fill="url(#leafGrad)" />
      <path d="M12 6.5v11.5" stroke="rgba(28,52,20,0.55)" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function WindLayer() {
  const leaves = buildLeaves(12);
  const gusts = buildGusts(4);

  return (
    <div className="wind-layer">
      {gusts.map((g, i) => (
        <span
          key={`g${i}`}
          className="gust"
          style={{
            top: g.top,
            width: g.size,
            animationDuration: g.duration,
            animationDelay: g.delay,
            opacity: g.opacity,
          }}
        />
      ))}

      {leaves.map((l, i) => (
        <span
          key={`l${i}`}
          className="leaf"
          style={{
            top: l.top,
            width: l.size,
            height: l.size,
            animationDuration: l.duration,
            animationDelay: l.delay,
            opacity: l.opacity,
          }}
        >
          <Leaf />
        </span>
      ))}

      <span className="kite" style={{ top: "46%" }}>
        <Kite />
      </span>
    </div>
  );
}

function WeatherBackdrop({ condition, isDay, windy }: Props) {
  const drops = useMemo(() => (condition ? buildDrops(condition) : []), [condition]);
  const clouds = useMemo(() => (condition ? buildClouds(condition) : []), [condition]);
  const motes = useMemo(() => buildMotes(), []);

  if (!condition) return null;

  const showSun = condition === "clear" || condition === "mostly-clear";
  const isRainy = condition === "drizzle" || condition === "rain" || condition === "downpour" || condition === "thunder";

  const stormy = condition === "thunder" || condition === "downpour";

  return (
    <div key={condition} className="weather-layer" aria-hidden="true">
      {stormy && <span className="storm-wash" />}

      {showSun && isDay && (
        <>
          <div className="sun-rays" />
          <div className="sun-core" />
        </>
      )}

      {showSun && !isDay && <div className="moon-core" />}

      {condition === "clear" && isDay &&
        motes.map((m, i) => (
          <span
            key={i}
            className="mote"
            style={{ left: m.left, top: m.top, animationDuration: m.duration, animationDelay: m.delay }}
          />
        ))}

      {(condition === "overcast" || condition === "cloudy") && <span className="cloud-wash" />}


      {clouds.map((c, i) => (
        <span
          key={i}
          className={`cloud${c.far ? " cloud--far" : ""}`}
          style={{
            top: c.top,
            width: c.width,
            height: c.height,
            animationDuration: c.duration,
            animationDelay: c.delay,
            opacity: c.opacity,
          }}
        >
          <CloudShape opacity={c.opacity} />
        </span>
      ))}

      {condition === "fog" && (
        <>
          <span className="fog-band" style={{ top: "18%" }} />
          <span className="fog-band" style={{ top: "52%", animationDelay: "-24s" }} />
          <span className="fog-band" style={{ top: "76%", animationDelay: "-48s" }} />
        </>
      )}

      {isRainy &&
        drops.map((d, i) => (
          <span
            key={i}
            className="rain-drop"
            style={{
              left: d.left,
              height: d.height,
              animationDuration: d.duration,
              animationDelay: d.delay,
              opacity: d.opacity,
              width: d.width,
              filter: d.blur === "0px" ? undefined : `blur(${d.blur})`,
              ["--dx" as string]: d.dx,
            } as React.CSSProperties}
          />
        ))}

      {windy && <WindLayer />}

      {condition === "thunder" && (
        <>
          <span className="lightning" />
          <span className="lightning" style={{ animationDelay: "0.35s" }} />
        </>
      )}
    </div>
  );
}

export default memo(WeatherBackdrop);
