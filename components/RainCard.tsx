"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VisitorLocation } from "@/lib/geo";
import {
  AUTO_MS,
  CACHE_FRESH_MS,
  DAILY_CAP,
  fetchPlace,
  fetchRain,
  intensityWord,
  mmPerHour,
  noteRainCalls,
  readPlace,
  readRainCache,
  readRainCalls,
  verdictFor,
  writeRainCache,
  type Coords,
  type RainPoint,
  type RainReport,
} from "@/lib/rain";

/** The verdict talks about six hours, so the strip shows six hours (24 × 15 min). */
const STRIP = 24;

const TONE = {
  raining: { chip: "border-sky-400/40 bg-sky-500/20 text-sky-100", bar: "#38bdf8" },
  soon: { chip: "border-amber-400/40 bg-amber-500/20 text-amber-100", bar: "#fbbf24" },
  maybe: { chip: "border-amber-400/30 bg-amber-500/15 text-amber-100", bar: "#fcd34d" },
  dry: { chip: "border-emerald-400/40 bg-emerald-500/20 text-emerald-100", bar: "#34d399" },
} as const;

/** ?rain=now|soon|maybe|dry — the same preview trick the backdrop uses. */
function previewPoints(kind: string, now: number): RainPoint[] {
  const step = 15 * 60_000;
  return Array.from({ length: 48 }, (_, i) => {
    const time = now + i * step;
    let mm = 0;
    let prob = 10;
    if (kind === "now") {
      mm = i < 6 ? 0.9 : 0;
      prob = i < 6 ? 85 : 25;
    } else if (kind === "soon") {
      mm = i >= 2 && i < 7 ? 0.6 : 0;
      prob = i >= 1 && i < 8 ? 75 : 20;
    } else if (kind === "maybe") {
      mm = 0;
      prob = i < 3 ? 65 : 25;
    }
    return { time, mm, prob };
  });
}

interface Props {
  visitor: VisitorLocation | null;
  /** Where the fallback points when there is no precise fix. */
  stationName: string | null;
  onUseExactLocation: () => void;
  note?: string | null;
  locating: boolean;
}

export default function RainCard({ visitor, stationName, onUseExactLocation, note, locating }: Props) {
  const coords: Coords | null = visitor?.coords ?? null;
  const [report, setReport] = useState<RainReport | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleAt, setStaleAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const key = coords ? `${coords.lat.toFixed(2)},${coords.lon.toFixed(2)}` : null;

  const load = useCallback(
    async (position: Coords, force = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const cached = readRainCache(position);
      if (cached && !force && Date.now() - cached.savedAt < CACHE_FRESH_MS) {
        setReport(cached.report);
        setStaleAt(null);
        setError(null);
        setLoading(false);
        return;
      }

      if (!force && readRainCalls() >= DAILY_CAP) {
        if (cached) {
          setReport(cached.report);
          setStaleAt(cached.savedAt);
        } else {
          setError("Today's rain-check budget is spent.");
        }
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const next = await fetchRain(position, controller.signal);
        noteRainCalls(1);
        setReport(next);
        setStaleAt(null);
        setError(null);
        writeRainCache(position, next);
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        if (cached) {
          setReport(cached.report);
          setStaleAt(cached.savedAt);
        } else {
          setError(e instanceof Error ? e.message : "Could not reach the rain service");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setTick((n) => n + 1);
        }
      }

      // The place name is independent, slow-moving, and cached for a day. A late
      // abort must not wipe a label that a newer request already set.
      fetchPlace(position, controller.signal)
        .then((label) => {
          if (!controller.signal.aborted) setPlace(label);
        })
        .catch(() => {
          if (!controller.signal.aborted) setPlace((prev) => prev);
        });
    },
    [],
  );

  useEffect(() => {
    if (!coords) {
      setReport(null);
      setPlace(null);
      return;
    }
    // A cached label should show immediately — the reading may come from cache too,
    // in which case load() never reaches its place lookup.
    setPlace(readPlace(coords));
    void load(coords);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Re-read the same series every minute: "rain in 25 minutes" has to count down.
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!coords) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void load(coords, true);
    }, AUTO_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const preview = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("rain");
  }, []);

  const shown: RainReport | null = useMemo(() => {
    if (preview && coords) {
      const points = previewPoints(preview, Date.now());
      return {
        coords,
        grid: { lat: coords.lat, lon: coords.lon, km: 7 },
        points,
        nowMm: preview === "now" ? 0.9 : 0,
        verdict: verdictFor(points, preview === "now" ? 0.9 : 0, Date.now()),
      };
    }
    return report;
    // tick drives the countdown
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, preview, coords, tick]);

  const verdict = useMemo(
    () => (shown ? verdictFor(shown.points, shown.nowMm, Date.now()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, tick],
  );

  const tone = verdict ? TONE[verdict.kind] : TONE.dry;
  const strip = useMemo(() => {
    if (!shown) return [];
    const now = Date.now();
    return shown.points.filter((p) => p.time + 15 * 60_000 > now).slice(0, STRIP);
  }, [shown, tick]);

  const maxMm = strip.reduce((max, p) => Math.max(max, p.mm), 0.4);
  const heaviestStrip = strip.reduce((max, p) => Math.max(max, p.mm), 0);
  const asOf = shown?.points.length
    ? new Date(shown.points[0].time).toLocaleTimeString("en-PH", {
        timeZone: "Asia/Manila",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : null;

  /* ------------------------------------------------- no precise fix yet */
  if (!coords) {
    return (
      <section className="glass glass-sheen lift overflow-hidden p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              <h2 className="font-display text-lg font-semibold tracking-tight text-white">Rain near you</h2>
            </div>
            <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-white/55">
              {stationName
                ? `No exact fix yet, so this would follow ${stationName}, the nearest station. Share your location and it follows the street you are on.`
                : "Share your location and this reads the next few hours where you actually are."}
            </p>
            {note && <p className="mt-1.5 text-[11px] text-amber-200/85">{note}</p>}
          </div>
          <button
            type="button"
            onClick={onUseExactLocation}
            disabled={locating}
            className="shrink-0 rounded-full border border-sky-400/30 bg-sky-400/15 px-3 py-1.5 text-[11.5px] font-medium text-sky-50 transition hover:bg-sky-400/25 disabled:opacity-50"
          >
            {locating ? "Locating…" : "Use my exact location"}
          </button>
        </div>
      </section>
    );
  }

  /* ------------------------------------------------------------- the card */
  return (
    <section className="glass glass-sheen lift overflow-hidden p-5 sm:p-6">
      <div
        className="pointer-events-none absolute inset-0 rounded-[1.5rem] opacity-70"
        style={{ background: "radial-gradient(120% 140% at 8% 0%, rgba(56,189,248,0.18), transparent 58%)" }}
        aria-hidden="true"
      />

      <div className="relative">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              <h2 className="font-display text-lg font-semibold tracking-tight text-white">Rain near you</h2>
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.12em] text-white/50">
                {visitor?.source === "gps" ? "your location" : "approximate"}
              </span>
            </div>
            <p className="mt-1 truncate text-[11.5px] text-white/45">
              {place ?? (visitor?.cityName ? `Near ${visitor.cityName}` : "Your position")}
              {shown ? ` · forecast grid point ${shown.grid.km} km from you` : ""}
            </p>
          </div>

          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${tone.chip}`}
          >
            {verdict?.kind === "raining"
              ? "raining"
              : verdict?.kind === "soon"
                ? "rain coming"
                : verdict?.kind === "maybe"
                  ? "maybe"
                  : "dry"}
          </span>
        </header>

        <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <p className="font-display text-[19px] font-semibold leading-snug text-white sm:text-[22px]">
              {loading && !shown ? "Checking the next few hours…" : verdict?.headline ?? "—"}
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-white/60">
              {verdict?.detail ?? "One 15-minute forecast for the point you are standing on."}
            </p>
          </div>

          {/* next three hours, one bar per 15 minutes */}
          <div className="w-[240px] min-w-0 sm:w-[300px]">
            <div
              className="grid h-[54px] grid-cols-[repeat(24,minmax(0,1fr))] items-end gap-[2px]"
              role="img"
              aria-label="Rain for the next six hours, one bar per 15 minutes"
            >
              {strip.map((point, i) => {
                // A dry step still gets a visible stub, so the 12 columns read as a timeline.
                const height = point.mm > 0 ? 16 + (point.mm / maxMm) * 36 : 8;
                return (
                  <span
                    key={point.time}
                    title={`${new Date(point.time).toLocaleTimeString("en-PH", {
                      timeZone: "Asia/Manila",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })} · ${point.mm.toFixed(1)} mm · ${point.prob}% chance`}
                    className="rounded-[3px] transition-all"
                    style={{
                      height: `${height}px`,
                      background:
                        point.mm > 0
                          ? `linear-gradient(180deg, ${tone.bar}, ${tone.bar}99)`
                          : "rgba(255,255,255,0.16)",
                      opacity: point.mm > 0 ? 0.6 + Math.min(0.4, point.mm) : 1,
                      outline: i === 0 ? "1px solid rgba(255,255,255,0.3)" : "none",
                      outlineOffset: "1px",
                    }}
                  />
                );
              })}
            </div>
            <div className="mt-[2px] h-px w-full bg-white/15" />
            {/* four labels across six hours: 0h, +2h, +4h, +6h */}
            <div className="mt-1 flex justify-between text-[10px] uppercase tracking-[0.08em] text-white/40">
              <span>now</span>
              <span>+2h</span>
              <span>+4h</span>
              <span>+6h</span>
            </div>
          </div>
        </div>

        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] leading-relaxed text-white/40">
          <span className="text-white/55">
            {asOf ? `As of ${asOf} PHT` : "Waiting for the first reading"}
          </span>
          <span>· 15-minute model, not radar</span>
          <span>· place name © OpenStreetMap</span>
          <span>· {readRainCalls()} of {DAILY_CAP} checks used today</span>
          {staleAt && (
            <span className="text-amber-200/80">
              · showing the reading saved at{" "}
              {new Date(staleAt).toLocaleTimeString("en-PH", {
                timeZone: "Asia/Manila",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })}
            </span>
          )}
          {error && <span className="text-amber-200/80">· {error}</span>}
        </p>
      </div>
    </section>
  );
}
