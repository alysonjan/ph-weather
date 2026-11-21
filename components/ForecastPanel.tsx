"use client";

import { memo } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CitySnapshot, ConditionGroup, HourlyPoint } from "@/lib/weather";
import { celsius, clockTime, dayDate, dayName, describe, shareOfHours, shortLabel } from "@/lib/weather";
import type { VisitorLocation } from "@/lib/geo";
import WeatherIcon from "./WeatherIcon";

interface Props {
  snapshots: CitySnapshot[];
  selectedId: string;
  onSelect: (id: string) => void;
  hourly: HourlyPoint[] | null;
  hourlyLoading: boolean;
  /** Set only while the open station is the one picked from the visitor's location. */
  near?: VisitorLocation | null;
  onUseExactLocation?: () => void;
  locateNote?: string | null;
}

const FILTERS = ["All", "Metro Cebu", "Luzon", "Visayas", "Mindanao"] as const;
type Filter = (typeof FILTERS)[number];

const GROUP_STYLE: Record<ConditionGroup, { bar: string; dot: string }> = {
  sun: { bar: "bg-amber-300/80", dot: "bg-amber-300" },
  cloud: { bar: "bg-slate-300/55", dot: "bg-slate-300" },
  rain: { bar: "bg-sky-400/85", dot: "bg-sky-400" },
  storm: { bar: "bg-violet-400/85", dot: "bg-violet-400" },
};

function rainVerdict(chance: number | null): { label: string; tone: string } {
  if (chance == null) return { label: "No data", tone: "text-white/45" };
  if (chance >= 70) return { label: "Yes, likely", tone: "text-sky-200" };
  if (chance >= 40) return { label: "Maybe", tone: "text-amber-200" };
  if (chance >= 15) return { label: "Unlikely", tone: "text-white/70" };
  return { label: "Almost none", tone: "text-emerald-200" };
}

function ForecastPanel({
  snapshots,
  selectedId,
  onSelect,
  hourly,
  hourlyLoading,
  near = null,
  onUseExactLocation,
  locateNote = null,
}: Props) {
  const [filter, setFilter] = useState<Filter>("Metro Cebu");
  const chipRow = useRef<HTMLDivElement>(null);

  // Keep the active chip in view without moving the page (the row is horizontally scrolled).
  useEffect(() => {
    const row = chipRow.current;
    const chip = row?.querySelector<HTMLElement>(`[data-city="${selectedId}"]`);
    if (!row || !chip) return;
    row.scrollLeft = chip.offsetLeft - row.offsetLeft - row.clientWidth / 2 + chip.clientWidth / 2;
  }, [selectedId, filter]);

  // The selection can change from outside this panel — the visitor's location on load,
  // or a tap on the hottest/coldest rows — so widen the filter to reach it rather than
  // leaving the panel showing a station the row has hidden.
  useEffect(() => {
    const s = snapshots.find((x) => x.city.id === selectedId);
    if (!s) return;
    const fits =
      filter === "All" ||
      (filter === "Metro Cebu" ? s.city.metro === "cebu" : s.city.island === filter);
    if (!fits) setFilter(s.city.island);
  }, [selectedId, snapshots, filter]);

  const inFilter = useMemo(
    () => (f: Filter, list: CitySnapshot[]) =>
      f === "All"
        ? list
        : f === "Metro Cebu"
          ? list.filter((s) => s.city.metro === "cebu")
          : list.filter((s) => s.city.island === f),
    [],
  );

  const visible = useMemo(() => inFilter(filter, snapshots), [snapshots, filter, inFilter]);

  const selected = snapshots.find((s) => s.city.id === selectedId) ?? snapshots[0];
  if (!selected) return null;

  const meta = describe(selected.code);
  const today = selected.days[0];
  const days = selected.days.slice(1, 6);
  const weekMin = Math.min(...days.map((d) => d.min));
  const weekMax = Math.max(...days.map((d) => d.max));
  const weekSpan = weekMax - weekMin || 1;

  const todayHours = useMemo(() => {
    if (!hourly || !today) return [];
    const sameDay = hourly.filter((h) => h.time.slice(0, 10) === today.date);
    const nowHour = selected.observedAt.slice(0, 13);
    const remaining = sameDay.filter((h) => h.time.slice(0, 13) >= nowHour);
    return remaining.length >= 4 ? remaining : sameDay;
  }, [hourly, today, selected.observedAt]);

  const shares = useMemo(() => (todayHours.length ? shareOfHours(todayHours) : []), [todayHours]);

  const upcoming = useMemo(() => {
    if (!hourly) return [];
    const start = hourly.findIndex((h) => h.time >= selected.observedAt.slice(0, 13));
    const from = start < 0 ? 0 : start;
    return hourly.slice(from, from + 24);
  }, [hourly, selected.observedAt]);

  const hourLo = Math.min(...upcoming.map((h) => h.temp), Infinity);
  const hourHi = Math.max(...upcoming.map((h) => h.temp), -Infinity);

  const verdict = rainVerdict(today?.rainChance ?? null);
  const nearYou = near !== null && near.cityId === selected.city.id;
  // Worth offering when the pick came from an IP guess — or when nothing resolved at all.
  const showExactButton = Boolean(onUseExactLocation) && near?.source !== "gps";

  return (
    <section className="glass glass-sheen lift overflow-hidden p-5 sm:p-7">
      <div
        className="pointer-events-none absolute inset-0 rounded-[1.5rem] opacity-80"
        style={{ background: "radial-gradient(110% 120% at 12% 0%, rgba(56,189,248,0.16), transparent 58%)" }}
        aria-hidden="true"
      />

      <div className="relative">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              <h2 className="font-display text-lg font-semibold tracking-tight text-white">Five-day outlook</h2>
              {nearYou && (
                <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-sky-100">
                  {near.outside ? "Default station" : "Nearest to you"}
                </span>
              )}
            </div>
            <p className="mt-1 max-w-lg text-[12.5px] leading-relaxed text-white/50">
              {nearYou
                ? near.outside
                  ? `You look like you're outside the Philippines, so this opens on ${selected.city.name}. Tap a city to switch.`
                  : `${selected.city.name} is the station closest to where you are${
                      near.km >= 5 ? `, about ${near.km} km away` : ""
                    }. Tap another any time.`
                : "Pick a city, then read today at a glance and the days ahead."}
            </p>

            {showExactButton && (
              <button
                type="button"
                onClick={onUseExactLocation}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10.5px] text-white/60 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <circle cx="8" cy="8" r="2.6" />
                  <path d="M8 1.2v2.4M8 12.4v2.4M1.2 8h2.4M12.4 8h2.4" strokeLinecap="round" />
                </svg>
                Use my exact location
              </button>
            )}

            {locateNote && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-amber-200/85">{locateNote}</p>
            )}
          </div>

          <div className="flex rounded-full border border-white/10 bg-white/[0.04] p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFilter(f);
                  const pool = inFilter(f, snapshots);
                  if (pool.length && !pool.some((s) => s.city.id === selected.city.id)) {
                    onSelect(pool[0].city.id);
                  }
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  filter === f ? "bg-white/15 text-white" : "text-white/45 hover:text-white/75"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </header>

        <div
          ref={chipRow}
          className="chip-row mt-4 flex gap-1.5 overflow-x-auto pb-1 [mask-image:linear-gradient(to_right,#000_93%,transparent_100%)]"
        >
          {visible.map((s) => {
            const active = s.city.id === selected.city.id;
            return (
              <button
                key={s.city.id}
                type="button"
                data-city={s.city.id}
                onClick={() => onSelect(s.city.id)}
                aria-pressed={active}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] transition-colors ${
                  active
                    ? "border-white/25 bg-white/15 text-white"
                    : "border-white/[0.08] bg-white/[0.03] text-white/55 hover:border-white/15 hover:text-white/85"
                }`}
              >
                {s.city.name}
                <span className="tnum ml-1.5 text-white/40">{celsius(s.temp)}</span>
              </button>
            );
          })}
        </div>

        {/* selected station */}
        <div className="mt-4 grid gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex items-center gap-3 sm:gap-4">
            <WeatherIcon
              condition={meta.condition}
              isDay={selected.isDay}
              className="h-11 w-11 shrink-0 text-sky-200 sm:h-14 sm:w-14"
              strokeWidth={1.4}
            />
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold text-white sm:text-xl">
                {selected.city.name}
              </p>
              <p className="text-[11px] text-white/45">
                {selected.city.region} · {selected.city.island}
                <span className="tnum hidden sm:inline">
                  {" "}
                  · {selected.city.lat.toFixed(2)}°N {selected.city.lon.toFixed(2)}°E
                </span>
              </p>
              <p className="mt-1 text-[12px] text-white/70">
                Right now: {meta.label.toLowerCase()}
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="tnum font-display text-3xl font-semibold leading-none text-white sm:text-4xl">
                {celsius(selected.temp, 1)}
              </p>
              <p className="tnum mt-1 text-[11px] text-white/40">feels {celsius(selected.feelsLike, 1)}</p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-white/[0.07] pt-3 sm:grid-cols-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            {[
              { k: "Humidity", v: `${selected.humidity}%` },
              { k: "Wind", v: `${selected.wind.toFixed(1)} km/h` },
              { k: "UV today", v: today?.uvMax != null ? today.uvMax.toFixed(1) : "—" },
              { k: "Rain now", v: `${selected.rainNow.toFixed(1)} mm` },
            ].map((s) => (
              <div key={s.k}>
                <dt className="text-[10px] uppercase tracking-[0.12em] text-white/35">{s.k}</dt>
                <dd className="tnum mt-0.5 text-[13px] font-medium text-white/85">{s.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* today at a glance */}
        <div className="mt-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Today at a glance · {selected.city.name}
            </p>
            <p className="text-[10px] text-white/35">
              {today ? dayDate(today.date) : ""} · rest of today
            </p>
          </div>

          {/* three plain answers */}
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.12em] text-white/35">Will it rain?</p>
              <p className={`mt-1 text-[15px] font-semibold ${verdict.tone}`}>{verdict.label}</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.12em] text-white/35">Chance of rain</p>
              <p className="tnum mt-1 text-[15px] font-semibold text-white/90">
                {today?.rainChance != null ? `${today.rainChance}%` : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.12em] text-white/35">Rain expected</p>
              <p className="tnum mt-1 text-[15px] font-semibold text-white/90">
                {today ? `${today.rainSum.toFixed(1)} mm` : "—"}
              </p>
            </div>
          </div>

          {/* how the hours break down */}
          <div className="mt-3.5">
            {shares.length ? (
              <>
                <div className="flex h-2.5 overflow-hidden rounded-full ring-1 ring-inset ring-white/10">
                  {shares.map((s) => (
                    <div
                      key={s.group}
                      className={GROUP_STYLE[s.group].bar}
                      style={{ width: `${s.pct}%` }}
                      title={`${s.label} ${s.pct}% of the remaining hours`}
                    />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  {shares.map((s) => (
                    <span key={s.group} className="flex items-center gap-1.5 text-[11px] text-white/55">
                      <span className={`h-2 w-2 rounded-full ${GROUP_STYLE[s.group].dot}`} />
                      {s.label}
                      <span className="tnum font-semibold text-white/85">{s.pct}%</span>
                    </span>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-white/45">
                  Share of the remaining hours that look like this — different from the “chance of rain” figure,
                  which is how likely rain is at all today.
                </p>
              </>
            ) : (
              <div className="h-[30px] animate-pulse rounded-lg bg-white/[0.04]" />
            )}
          </div>
        </div>

        {/* days */}
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {days.map((d, i) => {
            const m = describe(d.code);
            const left = ((d.min - weekMin) / weekSpan) * 100;
            const width = ((d.max - d.min) / weekSpan) * 100;
            return (
              <article
                key={d.date}
                className="rise group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.035] px-3 py-3.5 text-center transition-colors last:col-span-2 hover:border-white/15 hover:bg-white/[0.06] sm:last:col-span-1"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <div className="flex items-baseline justify-between">
                  <p className="text-[11.5px] font-semibold text-white/80">{dayName(d.date, i + 1)}</p>
                  <p className="text-[10px] text-white/40">{dayDate(d.date)}</p>
                </div>

                <WeatherIcon
                  condition={m.condition}
                  isDay
                  className="mx-auto mt-2 h-9 w-9 text-white/80 transition-transform duration-300 group-hover:scale-110"
                  strokeWidth={1.5}
                />

                <p className="mt-1.5 text-[10.5px] font-medium text-white/55">{shortLabel(d.code)}</p>

                <div className="mt-1.5 flex items-baseline justify-center gap-1.5">
                  <span className="tnum text-lg font-semibold text-white">{celsius(d.max)}</span>
                  <span className="tnum text-[11px] text-white/40">{celsius(d.min)}</span>
                </div>

                <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-white/[0.08]">
                  <span
                    className="absolute inset-y-0 rounded-full"
                    style={{
                      left: `${Math.max(0, Math.min(100, left))}%`,
                      width: `${Math.max(8, Math.min(100 - left, width))}%`,
                      backgroundImage: "linear-gradient(90deg,#38bdf8,#fbbf24,#fb7185)",
                    }}
                  />
                </div>

                <p className="tnum mt-2 flex items-center justify-center gap-1 text-[10px] text-sky-200/70">
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
                    <path d="M6 1.2s3.4 3.6 3.4 5.6A3.4 3.4 0 0 1 6 10.2 3.4 3.4 0 0 1 2.6 6.8C2.6 4.8 6 1.2 6 1.2Z" />
                  </svg>
                  {d.rainChance != null ? `${d.rainChance}%` : "—"}
                  {d.rainSum > 0 && <span className="text-white/35">· {d.rainSum.toFixed(1)} mm</span>}
                </p>
              </article>
            );
          })}
        </div>

        <p className="mt-2 px-1 text-[10px] leading-relaxed text-white/40">
          Bar = that day&apos;s range against the five days shown · droplet = chance of rain
        </p>

        {/* hourly ribbon */}
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">
              Next 24 hours · {selected.city.name}
            </p>
            <p className="text-[10px] text-white/30">Asia/Manila</p>
          </div>

          {hourlyLoading && !upcoming.length ? (
            <div className="h-[86px] animate-pulse rounded-xl bg-white/[0.04]" />
          ) : upcoming.length ? (
            <div className="chip-row flex items-end gap-1 overflow-x-auto pb-1 [mask-image:linear-gradient(to_right,#000_95%,transparent_100%)]">
              {upcoming.map((h, i) => {
                const norm = hourHi === hourLo ? 0.5 : (h.temp - hourLo) / (hourHi - hourLo);
                const barH = 10 + norm * 34;
                const label = h.time.slice(11, 13);
                const showLabel = i % 3 === 0;
                return (
                  <div key={h.time} className="flex w-9 shrink-0 flex-col items-center gap-1">
                    <span className="tnum text-[10px] font-medium text-white/70">{Math.round(h.temp)}°</span>
                    <span
                      className="w-full rounded-md"
                      style={{
                        height: `${barH}px`,
                        backgroundImage: "linear-gradient(180deg, rgba(251,191,36,0.9), rgba(56,189,248,0.55))",
                        opacity: 0.55 + norm * 0.45,
                      }}
                      title={`${label}:00 · ${h.temp.toFixed(1)}°C · ${h.rain}% rain`}
                    />
                    <span className={`text-[9px] ${showLabel ? "text-white/40" : "text-transparent"}`}>{label}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-white/30">Hourly detail unavailable.</p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.06] pt-3 text-[11px] text-white/40">
          <span className="flex items-center gap-1.5">
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5 text-amber-200/70"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              aria-hidden="true"
            >
              <circle cx="8" cy="8" r="3" />
              <path
                d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4"
                strokeLinecap="round"
              />
            </svg>
            Sunrise {clockTime(today?.sunrise ?? null)}
          </span>
          <span className="flex items-center gap-1.5">
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5 text-indigo-200/70"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              aria-hidden="true"
            >
              <path d="M2 12.5h12M4.5 12.5a3.5 3.5 0 0 1 7 0M8 3.5v2" strokeLinecap="round" />
            </svg>
            Sunset {clockTime(today?.sunset ?? null)}
          </span>
          <span className="tnum">Observed {clockTime(`${selected.observedAt}:00+08:00`)}</span>
        </div>
      </div>
    </section>
  );
}

export default memo(ForecastPanel);
