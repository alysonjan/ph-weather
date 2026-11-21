"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CACHE_TTL_MS,
  REFRESH_MS,
  buildReport,
  fetchCandidates,
  fetchStorm,
  fetchStormById,
  noteTyphoonCalls,
  pointInPar,
  readStormCache,
  readTyphoonCalls,
  writeStormCache,
  type Storm,
  type StormReport,
} from "@/lib/typhoons";
import TyphoonMap from "./TyphoonMap";

const TONE = {
  rose: "border-rose-400/40 bg-rose-500/20 text-rose-100",
  amber: "border-amber-400/40 bg-amber-500/20 text-amber-100",
  sky: "border-sky-400/40 bg-sky-500/20 text-sky-100",
} as const;


function dateRange(from: number, to: number): string {
  const fmt = (ms: number) =>
    new Date(ms).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
  return ` (${fmt(from)}–${fmt(to)}, ${new Date(to).getFullYear()})`;
}

function Fact({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: keyof typeof TONE }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.12em] text-white/35">{label}</p>
      <p className={`mt-1 text-[15px] font-semibold ${tone ? TONE[tone].split(" ").find((c) => c.startsWith("text-")) ?? "text-white" : "text-white"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[10.5px] leading-snug text-white/40">{detail}</p>
    </div>
  );
}

export default function TyphoonPanel({ homeCityId }: { homeCityId: string | null }) {
  const [storm, setStorm] = useState<Storm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staleAt, setStaleAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  const load = useCallback(async (force = false) => {
    const cached = readStormCache();
    const override = new URLSearchParams(window.location.search).get("storm");
    // A forced storm must not be short-circuited by the cache.
    if (cached && !force && !override && Date.now() - cached.savedAt < CACHE_TTL_MS) {
      setStorm(cached.storm);
      setStaleAt(null);
      setLoading(false);
      return;
    }

    try {
      const candidates = await fetchCandidates(120);
      noteTyphoonCalls(1);
      let found: Storm | null = null;

      if (override) {
        const [id, episode] = override.split(":");
        found = await fetchStormById(id, Number(episode ?? 1) || 1);
        noteTyphoonCalls(2);
      } else {
        /*
         * Only a storm that is inside PAR — or whose forecast track enters it —
         * belongs on this panel. Live ones first, then the most recent finished
         * one whose last position was in the neighbourhood. At most two track
         * fetches, because each is ~225 KB.
         */
        const nearPh = (c: (typeof candidates)[number]) =>
          c.lon >= 105 && c.lon <= 150 && c.lat >= 0 && c.lat <= 35;
        const ordered = [...candidates].sort(
          (a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || b.to - a.to,
        );
        for (const candidate of ordered.filter((c) => c.active || nearPh(c)).slice(0, 2)) {
          const full = await fetchStorm(candidate);
          noteTyphoonCalls(1);
          if (full.steps.some((step) => pointInPar(step.lon, step.lat))) {
            found = full;
            break;
          }
        }
      }

      setStorm(found);
      setStaleAt(null);
      setError(null);
      // A forced storm is for looking at, not for next visit's default.
      if (!override) writeStormCache(found, candidates);
    } catch (e) {
      const fallback = readStormCache();
      if (fallback) {
        setStorm(fallback.storm);
        setStaleAt(fallback.savedAt);
      } else {
        setError(e instanceof Error ? e.message : "Could not reach the storm catalogue");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A storm is re-issued every 6–12 hours; half an hour of drift is noise.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void load(true);
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const report: StormReport | null = useMemo(
    () => (storm ? buildReport(storm, homeCityId, now || Date.now()) : null),
    [storm, homeCityId, now],
  );

  // A finished storm that never crossed the boundary is not a typhoon story.
  const relevant = report && (report.phase !== "past" || storm!.steps.some((s) => pointInPar(s.lon, s.lat)));
  const shown = relevant ? report : null;

  const status = shown
    ? shown.phase === "inside"
      ? "Inside PAR"
      : shown.phase === "approaching"
        ? `Enters PAR in ~${shown.entersInHours ?? 0} h`
        : shown.phase === "past"
          ? "Last storm"
          : "Outside PAR"
    : "Quiet";

  const lead = shown
    ? shown.phase === "inside" && shown.current
      ? `${shown.storm.name} is inside PAR — ${shown.category.label.toLowerCase()}, about ${
          shown.nearest ? Math.round(shown.nearest.km).toLocaleString("en-PH") : "—"
        } km ${shown.fromCityDir ?? "from"} ${shown.nearest?.city.name ?? "the country"}.`
      : shown.phase === "approaching"
        ? `${shown.storm.name} is outside PAR, moving ${shown.heading ?? "slowly"} at ${
            shown.speedKmh ?? "—"
          } km/h — roughly ${shown.entersInHours ?? "several"} hours from crossing the boundary.`
        : shown.phase === "past"
          ? `${shown.storm.name} was the last storm inside PAR${dateRange(shown.storm.from, shown.storm.to)} — the track is the record of where it went.`
          : `${shown.storm.name} is outside PAR and not heading in.`
    : "No typhoon inside PAR right now.";

  const risk = "PANAHON";

  return (
    <section className="glass glass-sheen lift overflow-hidden p-5 sm:p-7">
      <div
        className="pointer-events-none absolute inset-0 rounded-[1.5rem] opacity-80"
        style={{ background: "radial-gradient(120% 130% at 18% 0%, rgba(56,189,248,0.16), transparent 58%)" }}
        aria-hidden="true"
      />

      <div className="relative">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              <h2 className="font-display text-lg font-semibold tracking-tight text-white">Typhoons</h2>
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.12em] text-white/50">
                PAR
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-white/55">
              {lead}
              {shown?.phase === "inside" && shown.closest && shown.closest.km < 900
                ? ` Closest to ${shown.closest.city.name}: ${Math.round(shown.closest.km).toLocaleString("en-PH")} km.`
                : ""}
            </p>
          </div>

          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
              shown
                ? TONE[shown.category.tone]
                : "border-white/12 bg-white/[0.06] text-white/50"
            }`}
          >
            {status}
          </span>
        </header>

        {error && !storm ? (
          <p className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-4 text-[12px] text-white/50">
            {error}. The track comes from GDACS straight to your browser; a blocked network will stop it
            loading. The PAR outline below still shows the area PAGASA monitors.
          </p>
        ) : null}

        {loading && !storm ? (
          <div className="mt-4 h-[320px] animate-pulse rounded-2xl bg-white/[0.04]" />
        ) : (
          <div className="mt-4">
            <TyphoonMap report={shown} />
          </div>
        )}

        {shown && shown.current && (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Fact
              label="Strength"
              value={shown.storm.wind == null ? "—" : `${Math.round(shown.storm.wind)} km/h`}
              detail={`${shown.category.label} · ${shown.category.meaning.toLowerCase()}`}
              tone={shown.category.tone}
            />
            <Fact
              label="Moving"
              value={shown.speedKmh == null ? shown.heading ?? "—" : `${shown.speedKmh} km/h`}
              detail={shown.heading ? `toward the ${shown.heading}` : "movement not reported"}
            />
            <Fact
              label={shown.closest ? `Closest to ${shown.closest.city.name}` : "Nearest station"}
              value={shown.closest ? `${Math.round(shown.closest.km).toLocaleString("en-PH")} km` : "—"}
              detail={
                shown.closest
                  ? new Date(shown.closest.time).toLocaleString("en-PH", {
                      timeZone: "Asia/Manila",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })
                  : "no station data"
              }
            />
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-white/35">
          <span>
            Track: GDACS (JTWC/NOAA) · PAR boundary: PAGASA · {readTyphoonCalls()} calls today
          </span>
          {staleAt && (
            <span className="text-amber-200/80">
              showing the track saved at{" "}
              {new Date(staleAt).toLocaleTimeString("en-PH", {
                timeZone: "Asia/Manila",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })}
            </span>
          )}
          <span className="text-white/25">{risk}</span>
        </div>
      </div>
    </section>
  );
}
