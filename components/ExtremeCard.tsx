"use client";

import { memo } from "react";
import type { CitySnapshot } from "@/lib/weather";
import { celsius, describe } from "@/lib/weather";
import WeatherIcon from "./WeatherIcon";

interface Props {
  title: string;
  caption: string;
  items: CitySnapshot[];
  tone: "heat" | "chill";
  activeId: string | null;
  onSelect: (id: string) => void;
}

const TONE = {
  heat: {
    dot: "bg-orange-400",
    ring: "shadow-[0_0_0_1px_rgba(251,146,60,0.35)]",
    bar: "linear-gradient(90deg,#fbbf24,#fb7185)",
    text: "text-orange-200",
    glow: "radial-gradient(120% 120% at 0% 0%, rgba(251,146,60,0.22), transparent 55%)",
    icon: "text-orange-200",
  },
  chill: {
    dot: "bg-sky-400",
    ring: "shadow-[0_0_0_1px_rgba(56,189,248,0.35)]",
    bar: "linear-gradient(90deg,#38bdf8,#a5f3fc)",
    text: "text-sky-200",
    glow: "radial-gradient(120% 120% at 0% 0%, rgba(56,189,248,0.2), transparent 55%)",
    icon: "text-sky-200",
  },
} as const;

function Rank({ n, tone }: { n: number; tone: "heat" | "chill" }) {
  const t = TONE[tone];
  if (n === 1) {
    return (
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-semibold ${t.text} ${t.ring}`}
      >
        01
      </span>
    );
  }
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-medium tabular-nums text-white/35">
      {String(n).padStart(2, "0")}
    </span>
  );
}

function ExtremeCard({ title, caption, items, tone, activeId, onSelect }: Props) {
  const t = TONE[tone];
  const temps = items.map((i) => i.temp);
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const span = hi - lo || 1;

  return (
    <section className="glass glass-sheen lift overflow-hidden p-5 sm:p-6">
      <div
        className="pointer-events-none absolute inset-0 rounded-[1.5rem] opacity-70"
        style={{ background: t.glow }}
        aria-hidden="true"
      />
      <div className="relative">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${t.dot}`} />
              <h2 className="font-display text-lg font-semibold tracking-tight text-white">{title}</h2>
            </div>
            <p className="mt-1 text-xs text-white/45">{caption}</p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white/45">
            Air temp
          </span>
        </header>

        <ol className="space-y-1">
          {items.map((s, i) => {
            const meta = describe(s.code);
            const active = activeId === s.city.id;
            const width = 22 + ((s.temp - lo) / span) * 78;
            return (
              <li key={s.city.id} className="rise" style={{ animationDelay: `${i * 55}ms` }}>
                <button
                  type="button"
                  onClick={() => onSelect(s.city.id)}
                  aria-pressed={active}
                  className={`group flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors duration-200 ${
                    active ? "bg-white/[0.09] ring-1 ring-inset ring-white/15" : "hover:bg-white/[0.05]"
                  }`}
                >
                  <Rank n={i + 1} tone={tone} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[15px] font-medium text-white/90">{s.city.name}</p>
                      {s.city.highland && (
                        <span className="shrink-0 rounded-full border border-white/10 px-1.5 py-px text-[9px] uppercase tracking-wide text-white/40">
                          upland
                        </span>
                      )}
                      <WeatherIcon
                        condition={meta.condition}
                        isDay={s.isDay}
                        className={`ml-auto h-4 w-4 shrink-0 opacity-70 ${t.icon}`}
                      />
                    </div>
                    <p className="truncate text-[11px] text-white/45">
                      {s.city.region} · {s.humidity}% RH
                      <span className="hidden sm:inline"> · {s.wind.toFixed(1)} km/h</span>
                    </p>
                    <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className="h-full rounded-full transition-[width] duration-700 ease-out"
                        style={{ width: `${width}%`, backgroundImage: t.bar }}
                      />
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="tnum text-[22px] font-semibold leading-none text-white">
                      {celsius(s.temp, 1)}
                    </p>
                    <p className="tnum mt-1 text-[10px] text-white/40">feels {celsius(s.feelsLike, 1)}</p>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export default memo(ExtremeCard);
