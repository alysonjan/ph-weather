"use client";

import { memo } from "react";
import { SUPER_EL_NINO, gaugePercent, SUPER_THRESHOLD, seasonLabel } from "@/lib/elnino";
import { localClimate, CLIMATE_PERIOD, CLIMATE_SOURCE } from "@/lib/climate";
import { CITIES, HOME_CITY_ID } from "@/lib/cities";
import type { HistoryDay } from "@/lib/weather";

const GAUGE_MIN = -1;
const GAUGE_MAX = 3;

const ZONES = [
  { from: -1, to: 0.5, cls: "bg-white/10", label: "Neutral" },
  { from: 0.5, to: 1.5, cls: "bg-amber-400/25", label: "El Niño" },
  { from: 1.5, to: 2, cls: "bg-orange-500/40", label: "Very strong" },
  { from: 2, to: 3, cls: "bg-rose-500/45", label: "Super" },
];

const STEPS = [
  { label: "Normal", range: "below +0.5", from: -9, to: 0.5, bar: "bg-white/25", text: "text-white/60" },
  { label: "El Niño", range: "+0.5 to +1.5", from: 0.5, to: 1.5, bar: "bg-amber-300", text: "text-amber-200" },
  { label: "Strong", range: "+1.5 to +2.0", from: 1.5, to: 2, bar: "bg-orange-400", text: "text-orange-200" },
  { label: "Super", range: "+2.0 and up", from: 2, to: 9, bar: "bg-rose-400", text: "text-rose-200" },
];

const CHART_H = 260;
const CHART_W = 720;
const PAD_L = 10;
const PAD_R = 12;
const PAD_T = 18;
const PAD_B = 26;

/** Centre months name the winter they straddle: DJF 1983 is the 1982–83 event. */
function eventLabel(season: string, year: number): string {
  if (season === "DJF") return `${year - 1}–${String(year % 100).padStart(2, "0")}`;
  if (season === "NDJ") return `${year}–${String((year + 1) % 100).padStart(2, "0")}`;
  return `${year}`;
}

const TONE = {
  rose: "border-rose-400/40 bg-rose-500/20 text-rose-100",
  amber: "border-amber-400/40 bg-amber-500/20 text-amber-100",
  emerald: "border-emerald-400/40 bg-emerald-500/20 text-emerald-100",
  sky: "border-sky-400/40 bg-sky-500/20 text-sky-100",
} as const;

function OniChart() {
  const points = SUPER_EL_NINO.chart;
  const values = points.map((p) => p.value);
  const lo = Math.min(-1.4, ...values) - 0.15;
  const hi = Math.max(2.2, ...values) + 0.15;

  const x = (i: number) => PAD_L + (i * (CHART_W - PAD_L - PAD_R)) / (points.length - 1);
  const y = (v: number) => PAD_T + ((hi - v) / (hi - lo)) * (CHART_H - PAD_T - PAD_B);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${CHART_H - PAD_B} L${x(0).toFixed(1)} ${CHART_H - PAD_B} Z`;

  const yearTicks = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.season === "DJF")
    .map(({ p, i }, k) => ({ year: p.year, x: x(i), k }))
    .filter(({ k }) => k % 5 === 0);

  const last = points.length - 1;

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="w-full"
      role="img"
      aria-label="Oceanic Niño Index over the last 30 years"
    >
      <defs>
        <linearGradient id="oniFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff8a5c" stopOpacity="0.38" />
          <stop offset="55%" stopColor="#ff8a5c" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#ff8a5c" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="oniStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7ee0ff" />
          <stop offset="60%" stopColor="#ffb703" />
          <stop offset="100%" stopColor="#ff6b6b" />
        </linearGradient>
      </defs>

      {[SUPER_THRESHOLD, 1.5, 0.5, 0].map((v) => (
        <g key={v}>
          <line
            x1={PAD_L}
            x2={CHART_W - PAD_R}
            y1={y(v)}
            y2={y(v)}
            stroke={v === SUPER_THRESHOLD ? "rgba(255,107,107,0.55)" : "rgba(255,255,255,0.12)"}
            strokeWidth={v === SUPER_THRESHOLD ? 1.2 : 1}
            strokeDasharray={v === SUPER_THRESHOLD ? "5 5" : "2 6"}
          />
          <text
            x={CHART_W - PAD_R}
            y={y(v) - 5}
            textAnchor="end"
            className="fill-white/45"
            fontSize="11"
            fontFamily="ui-sans-serif, system-ui"
          >
            {v === SUPER_THRESHOLD ? "+2.0 super" : v === 0 ? "0" : `+${v}`}
          </text>
        </g>
      ))}

      <path d={area} fill="url(#oniFill)" />
      <path
        d={line}
        fill="none"
        stroke="url(#oniStroke)"
        strokeWidth="2.1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {yearTicks.map((t) => (
        <g key={t.year}>
          <line
            x1={t.x}
            x2={t.x}
            y1={CHART_H - PAD_B}
            y2={CHART_H - PAD_B + 4}
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="1"
          />
          <text
            x={t.x}
            y={CHART_H - 6}
            textAnchor="middle"
            className="fill-white/45"
            fontSize="11"
            fontFamily="ui-sans-serif, system-ui"
          >
            {t.year}
          </text>
        </g>
      ))}

      <circle cx={x(last)} cy={y(points[last].value)} r="9" fill="#ff6b6b" opacity="0.18" />
      <circle cx={x(last)} cy={y(points[last].value)} r="3.6" fill="#fff" stroke="#ff6b6b" strokeWidth="2" />
      <text
        x={x(last) - 10}
        y={y(points[last].value) - 12}
        textAnchor="end"
        className="fill-white"
        fontSize="12.5"
        fontWeight="600"
        fontFamily="ui-sans-serif, system-ui"
      >
        {points[last].value.toFixed(2)}
      </text>
    </svg>
  );
}

function Gauge({ value }: { value: number }) {
  const pct = gaugePercent(value, GAUGE_MIN, GAUGE_MAX);
  const thresholdPct = gaugePercent(SUPER_THRESHOLD, GAUGE_MIN, GAUGE_MAX);

  return (
    <div>
      <div className="relative h-12">
        <div className="absolute top-0 -translate-x-1/2 transition-[left] duration-700" style={{ left: `${pct}%` }}>
          <span className="tnum block whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[#0b1020] shadow-[0_4px_16px_-4px_rgba(255,255,255,0.6)]">
            {value >= 0 ? "+" : ""}
            {value.toFixed(2)}
          </span>
          <span className="mx-auto mt-0.5 block h-1.5 w-px bg-white/50" />
        </div>

        <div className="absolute inset-x-0 top-7 flex h-3 overflow-hidden rounded-full ring-1 ring-inset ring-white/10">
          {ZONES.map((z) => {
            const left = gaugePercent(z.from, GAUGE_MIN, GAUGE_MAX);
            const right = gaugePercent(z.to, GAUGE_MIN, GAUGE_MAX);
            return <div key={z.label} className={z.cls} style={{ width: `${right - left}%` }} />;
          })}
        </div>

        <div
          className="absolute top-4 -translate-x-1/2"
          style={{ left: `${thresholdPct}%` }}
          title="Super El Niño threshold: +2.0 °C"
        >
          <div className="h-10 w-[2px] rounded-full bg-rose-300/90 shadow-[0_0_10px_rgba(253,164,175,0.55)]" />
        </div>

        <div
          className="absolute top-[22px] -translate-x-1/2 transition-[left] duration-700"
          style={{ left: `${pct}%` }}
        >
          <div className="h-8 w-[3px] rounded-full bg-white shadow-[0_0_14px_2px_rgba(255,255,255,0.6)]" />
        </div>
      </div>

      <div className="relative mt-1 h-3 text-[9.5px] font-medium uppercase tracking-[0.12em] text-white/40">
        {[
          { v: -1, label: "−1.0", cls: "" },
          { v: 0, label: "0", cls: "" },
          { v: 1.5, label: "+1.5", cls: "" },
          { v: 2, label: "+2.0", cls: "font-semibold text-rose-200" },
          { v: 3, label: "+3.0", cls: "" },
        ].map(({ v, label, cls }) => {
          const p = gaugePercent(v, GAUGE_MIN, GAUGE_MAX);
          const transform = p <= 1 ? "translateX(0)" : p >= 99 ? "translateX(-100%)" : "translateX(-50%)";
          return (
            <span key={v} className={`absolute top-0 ${cls}`} style={{ left: `${p}%`, transform }}>
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ElNinoPanel({
  history,
  cityId = HOME_CITY_ID,
}: {
  history: HistoryDay[] | null;
  /** The station whose local rain and heat are reported — the visitor's, when known. */
  cityId?: string;
}) {
  const d = SUPER_EL_NINO;
  const current = d.current;
  const cityName = CITIES.find((c) => c.id === cityId)?.name ?? "Cebu City";
  const local = history ? localClimate(cityId, history) : null;

  const found = STEPS.findIndex((s) => current.value >= s.from && current.value < s.to);
  const stepIndex = found < 0 ? STEPS.length - 1 : found;
  const active = STEPS[stepIndex];

  const stronger = d.superEvents.filter(
    (e) => e.peak.i !== d.peakThisEvent.i && e.peak.value > d.peakThisEvent.value,
  );
  const recordHolder = [...stronger].sort((a, b) => b.peak.value - a.peak.value)[0];
  const rank = stronger.length + 1;

  const eventRows = [
    ...d.superEvents.filter((e) => e.peak.i !== d.peakThisEvent.i),
    ...(d.isSuper ? [{ current: true } as const] : []),
  ];
  const maxPeak = Math.max(...d.superEvents.map((e) => e.peak.value), d.current.value);

  return (
    <section className="glass glass-sheen lift overflow-hidden p-5 sm:p-7">
      <div
        className="pointer-events-none absolute inset-0 rounded-[1.5rem] opacity-80"
        style={{ background: "radial-gradient(120% 130% at 82% 0%, rgba(255,107,107,0.18), transparent 58%)" }}
        aria-hidden="true"
      />

      <div className="relative">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-rose-400" />
              <h2 className="font-display text-lg font-semibold tracking-tight text-white">El Niño, in plain terms</h2>
            </div>
            <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-white/55">
              The ocean index is a single number for the whole Pacific. What actually changes here is the rain and
              the heat — so all three sit side by side.
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white/45">
            NOAA · {seasonLabel(current.season)} {current.year}
          </span>
        </header>

        {/* three plain answers */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <article className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">Where the Pacific is</p>
            <p className="mt-1 text-[10.5px] leading-snug text-white/35">
              How much warmer the central Pacific surface is than normal
            </p>
            <p
              className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] ${
                d.isSuper ? TONE.rose : TONE.amber
              }`}
            >
              {d.isSuper ? "Super El Niño" : "El Niño"}
            </p>
            <p className="tnum mt-3 font-display text-3xl font-semibold leading-none text-white">
              +{current.value.toFixed(2)}
              <span className="ml-1 text-sm font-medium text-white/45">°C</span>
            </p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-white/50">
              <span className="text-pretty">
                That is {Math.abs(d.marginToSuper).toFixed(2)} °C past the +2.0 line, which puts it inside the super
                band.
              </span>
            </p>
          </article>

          <article className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">
              {cityName} rain · last 3 months
            </p>
            {local ? (
              <>
                <p
                  className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] ${TONE[local.status.tone]}`}
                >
                  {local.status.label}
                </p>
                <p className="tnum mt-3 font-display text-3xl font-semibold leading-none text-white">
                  {local.pct90}
                  <span className="ml-1 text-sm font-medium text-white/45">% of normal</span>
                </p>
                <p className="mt-2 text-pretty text-[11.5px] leading-relaxed text-white/50">
                  {local.rain90} mm fell; {local.normal90} mm is normal for these three months.
                </p>
              </>
            ) : (
              <p className="mt-3 text-[11.5px] text-white/40">Reading rainfall history…</p>
            )}
          </article>

          <article className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">
              {cityName} heat · last 30 days
            </p>
            {local ? (
              <>
                <p
                  className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] ${
                    local.tmaxDelta >= 0.5 ? TONE.rose : local.tmaxDelta > -0.5 ? TONE.amber : TONE.sky
                  }`}
                >
                  {local.tmaxDelta >= 0.5
                    ? "Hotter than usual"
                    : local.tmaxDelta > -0.5
                      ? "Close to normal"
                      : "Cooler than usual"}
                </p>
                <p className="tnum mt-3 font-display text-3xl font-semibold leading-none text-white">
                  {local.tmaxDelta > 0 ? "+" : ""}
                  {local.tmaxDelta.toFixed(1)}
                  <span className="ml-1 text-sm font-medium text-white/45">°C</span>
                </p>
                <p className="mt-2 text-pretty text-[11.5px] leading-relaxed text-white/50">
                  Afternoon highs averaged {local.tmax30.toFixed(1)} °C; the normal is {local.normalTmax30.toFixed(1)} °C.
                </p>
              </>
            ) : (
              <p className="mt-3 text-[11.5px] text-white/40">Reading temperature history…</p>
            )}
          </article>
        </div>

        {/* ladder */}
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1">
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">Which band are we in?</p>
            <p className="tnum text-[11px] text-white/45">
              You are here: <span className={`font-semibold ${active.text}`}>{active.label}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STEPS.map((s, i) => {
              const isActive = i === stepIndex;
              return (
                <div
                  key={s.label}
                  className={`relative overflow-hidden rounded-xl border px-3 py-2.5 transition-colors ${
                    isActive ? "border-white/25 bg-white/10" : "border-white/[0.07] bg-white/[0.03]"
                  }`}
                >
                  <span
                    className={`absolute inset-x-0 top-0 h-[3px] ${s.bar} ${isActive ? "opacity-100" : "opacity-30"}`}
                  />
                  <p className={`text-[12px] font-semibold ${isActive ? "text-white" : "text-white/60"}`}>{s.label}</p>
                  <p className="tnum mt-0.5 text-[10px] text-white/40">ONI {s.range}</p>
                  {isActive && (
                    <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/70">
                      you are here
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* what it means */}
        <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
          <p className="text-[12.5px] leading-relaxed text-white/65">
            {d.isSuper ? (
              <>
                The Pacific has held <span className="font-semibold text-rose-200">super El Niño</span> level for{" "}
                {d.seasonsAtSuper} seasons — about {d.seasonsAtSuper * 3} months — and is still climbing (
                <span className="tnum text-white/80">
                  +{d.changeSinceLastSeason.toFixed(2)} since {seasonLabel(d.previous.season)}
                </span>
                ). El Niño tilts the odds toward less rain and hotter afternoons across the Philippines. It raises the
                chance of a dry spell; it does not guarantee one.
              </>
            ) : (
              <>
                The Pacific is in El Niño territory at{" "}
                <span className="tnum font-semibold text-amber-200">+{current.value.toFixed(2)} °C</span>, still{" "}
                {(SUPER_THRESHOLD - current.value).toFixed(2)} °C short of the super band.
              </>
            )}
          </p>

          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {[
              "The rainy season tends to start late and end early, so the wet months get squeezed.",
              "Afternoons run hotter, and city heat index climbs faster than the air temperature.",
              "PAGASA, the national weather bureau, declares drought after three months of far-below-normal rain — the same measure the rain card tracks.",
            ].map((line) => (
              <li key={line} className="flex gap-2 text-pretty text-[11.5px] leading-relaxed text-white/45">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/25" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* the ocean data, folded away */}
        <details className="group mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] [&::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <span className="text-[11.5px] font-medium text-white/60">
              Show the ocean data behind this
              <span className="ml-2 hidden text-white/30 sm:inline">
                {d.totalEvents} El Niño events since 1950 · this is the #{rank} strongest peak on record
              </span>
            </span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/35 transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>

          <div className="border-t border-white/[0.06] p-4">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <Gauge value={current.value} />

                <dl className="mt-4 grid grid-cols-2 gap-2.5">
                  {[
                    {
                      k: "Distance to +2.0",
                      v: d.isSuper
                        ? `+${Math.abs(d.marginToSuper).toFixed(2)} °C past`
                        : `${Math.abs(d.marginToSuper).toFixed(2)} °C to go`,
                      hint: d.isSuper ? "threshold cleared" : "threshold not met",
                    },
                    {
                      k: "Time at super",
                      v: d.seasonsAtSuper ? `${d.seasonsAtSuper} seasons` : "none yet",
                      hint: d.seasonsAtSuper ? `≈ ${d.seasonsAtSuper * 3} months` : "—",
                    },
                    {
                      k: "Onset ramp",
                      v: `${d.onsetRampPerSeason > 0 ? "+" : ""}${d.onsetRampPerSeason.toFixed(2)} °C/season`,
                      hint: `${d.onsetSeasons} seasons from onset`,
                    },
                    {
                      k: "Peak rank",
                      v: `#${rank} since 1950`,
                      hint: recordHolder
                        ? `behind ${eventLabel(recordHolder.peak.season, recordHolder.peak.year)} (${recordHolder.peak.value.toFixed(2)})`
                        : "strongest on record",
                    },
                  ].map((s) => (
                    <div key={s.k} className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                      <dt className="text-[10px] uppercase tracking-[0.13em] text-white/35">{s.k}</dt>
                      <dd className="tnum mt-1 text-[14px] font-semibold text-white/90">{s.v}</dd>
                      <dd className="mt-0.5 truncate text-[10px] text-white/35">{s.hint}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="flex flex-col">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                  <div className="mb-1 flex items-center justify-between px-1">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">Last 30 years</p>
                    <p className="text-[10px] text-white/40">dashed = super threshold</p>
                  </div>
                  <OniChart />
                </div>

                <div className="mt-3 flex-1">
                  <p className="mb-2 px-1 text-[10px] uppercase tracking-[0.14em] text-white/40">
                    Every super El Niño since 1950
                  </p>
                  <ul className="space-y-1.5">
                    {eventRows.map((row) => {
                      const isCurrent = "current" in row;
                      const evt = row as {
                        start: { year: number };
                        peak: { year: number; value: number; season: string };
                      };
                      const peak = isCurrent ? d.peakThisEvent.value : evt.peak.value;
                      const label = isCurrent ? `${d.peakThisEvent.year}` : eventLabel(evt.peak.season, evt.peak.year);
                      return (
                        <li key={label} className="flex items-center gap-2.5">
                          <span
                            className={`w-16 shrink-0 text-[11px] ${isCurrent ? "font-semibold text-rose-200" : "text-white/45"}`}
                          >
                            {label}
                          </span>
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${(peak / maxPeak) * 100}%`,
                                backgroundImage: isCurrent
                                  ? "linear-gradient(90deg,#ff6b6b,#ffb703)"
                                  : "linear-gradient(90deg,rgba(255,255,255,0.28),rgba(255,255,255,0.5))",
                              }}
                            />
                          </span>
                          <span
                            className={`tnum w-9 shrink-0 text-right text-[11px] ${isCurrent ? "font-semibold text-white" : "text-white/50"}`}
                          >
                            {peak.toFixed(2)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>

            <p className="mt-4 border-t border-white/[0.06] pt-3 text-[10px] leading-relaxed text-white/35">
              ONI is the 3-month running-mean sea-surface anomaly in Niño 3.4 (NOAA CPC). Rain and temperature
              normals are {CLIMATE_PERIOD} averages from {CLIMATE_SOURCE}. The rain status compares the last 90 days
              with the same window of a normal year — a useful estimate, not a PAGASA drought declaration.
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}

export default memo(ElNinoPanel);
