"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CITY_ID } from "@/lib/cities";
import {
  detectVisitorLocation,
  locationFromParam,
  requestExactLocation,
  type VisitorLocation,
} from "@/lib/geo";
import { SUPER_EL_NINO } from "@/lib/elnino";
import {
  celsius,
  describe,
  fetchAllCities,
  fetchCurrentOnly,
  fetchHistory,
  fetchHourly,
  type CitySnapshot,
  type Condition,
  type HistoryDay,
  type HourlyPoint,
} from "@/lib/weather";
import ExtremeCard from "./ExtremeCard";
import ElNinoPanel from "./ElNinoPanel";
import ForecastPanel from "./ForecastPanel";
import RainCard from "./RainCard";
import SiteNav from "./SiteNav";
import TyphoonPanel from "./TyphoonPanel";
import WeatherIcon from "./WeatherIcon";
import WeatherBackdrop from "./WeatherBackdrop";

function StatTile({
  label,
  snapshot,
  tone,
}: {
  label: string;
  snapshot: CitySnapshot | null;
  tone: "heat" | "chill";
}) {
  const meta = snapshot ? describe(snapshot.code) : null;
  return (
    <div className="glass glass-sheen flex flex-col justify-between gap-3 p-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display text-[13.5px] font-semibold leading-tight text-white sm:text-[15px]">
            {snapshot?.city.name ?? "—"}
          </p>
          <p className="truncate text-[10.5px] text-white/45">{snapshot?.city.region ?? "loading"}</p>
        </div>
        {meta && snapshot && (
          <WeatherIcon
            condition={meta.condition}
            isDay={snapshot.isDay}
            className={`h-7 w-7 shrink-0 sm:h-8 sm:w-8 ${tone === "heat" ? "text-orange-200" : "text-sky-200"}`}
            strokeWidth={1.4}
          />
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={`tnum font-display text-4xl font-semibold leading-none ${
            tone === "heat" ? "text-orange-100" : "text-sky-100"
          }`}
        >
          {snapshot ? celsius(snapshot.temp, 1) : "—"}
        </span>
        <span className="tnum text-[11px] text-white/35">
          {snapshot ? `feels ${celsius(snapshot.feelsLike, 1)}` : ""}
        </span>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {[0, 1].map((i) => (
        <div key={i} className="glass h-[420px] animate-pulse p-6">
          <div className="h-3 w-32 rounded-full bg-white/10" />
          <div className="mt-6 space-y-4">
            {[0, 1, 2, 3, 4].map((j) => (
              <div key={j} className="h-12 rounded-xl bg-white/[0.05]" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const AUTO_REFRESH_MS = 120_000;
const CACHE_KEY = "panahon:cache:v1";
const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

interface CachedSnapshot {
  savedAt: number;
  snapshots: CitySnapshot[];
}

/** Last good payload, so a refused API shows real numbers instead of an error card. */
function readCache(): CachedSnapshot | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSnapshot;
    if (!Array.isArray(parsed.snapshots) || !parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > CACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(snapshots: CitySnapshot[]): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), snapshots }));
  } catch {
    // Quota or private mode — the cache is a nicety, not a requirement.
  }
}

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Dashboard() {
  const [snapshots, setSnapshots] = useState<CitySnapshot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [clock, setClock] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(DEFAULT_CITY_ID);
  const [visitor, setVisitor] = useState<VisitorLocation | null>(null);
  const [locating, setLocating] = useState(true);
  const [locateNote, setLocateNote] = useState<string | null>(null);
  const [pickedByUser, setPickedByUser] = useState(false);
  const [historyNonce, setHistoryNonce] = useState(0);
  const [hourly, setHourly] = useState<HourlyPoint[] | null>(null);
  const [hourlyLoading, setHourlyLoading] = useState(false);
  const [history, setHistory] = useState<HistoryDay[] | null>(null);
  const [staleAt, setStaleAt] = useState<number | null>(null);
  const [auto, setAuto] = useState(true);
  const [forcedWx, setForcedWx] = useState<Condition | null>(null);
  const [forcedWindy, setForcedWindy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_REFRESH_MS / 1000);
  const hourlyCache = useRef(new Map<string, HourlyPoint[]>());
  const lastFetch = useRef(Date.now());
  const intervalRef = useRef(AUTO_REFRESH_MS);
  /** Read inside async callbacks, so a tap that lands mid-lookup still wins. */
  const pickedByUserRef = useRef(false);
  const historyKey = useRef<string | null>(null);
  const historyCache = useRef(new Map<string, HistoryDay[]>());

  /**
   * silent = background poll: current values only, merged over what is on screen.
   * The full six-day payload and the 92-day history are pulled on load and on Refresh.
   */
  const load = useCallback(async (silent = false) => {
    lastFetch.current = Date.now();
    setSecondsLeft(Math.round(intervalRef.current / 1000));
    if (!silent) setError(null);
    try {
      if (silent) {
        const fresh = await fetchCurrentOnly();
        setSnapshots((prev) =>
          prev ? prev.map((s) => ({ ...s, ...(fresh.get(s.city.id) ?? {}) })) : prev,
        );
        setUpdatedAt(new Date());
        return;
      }

      const data = await fetchAllCities();
      setSnapshots(data);
      setUpdatedAt(new Date());
      setStaleAt(null);
      writeCache(data);
    } catch (e) {
      // A failed background refresh keeps whatever is already on screen.
      if (!silent) {
        const cached = readCache();
        if (cached) {
          setSnapshots(cached.snapshots);
          setUpdatedAt(new Date(cached.savedAt));
          setStaleAt(cached.savedAt);
          setError(null);
        } else {
          setError(e instanceof Error ? e.message : "Could not reach the weather service");
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Open on the station nearest the visitor instead of a fixed city.
   * Silent by design: no permission dialog on load. A tap on any city wins from
   * that point on, and "Use my exact location" is there when the IP guess is off.
   */
  useEffect(() => {
    let alive = true;
    const forced = locationFromParam(window.location.search);
    detectVisitorLocation()
      .then((found) => {
        const pick = forced ?? found;
        if (!alive || !pick) return;
        setVisitor(pick);
        setSelectedId((current) => (pickedByUserRef.current ? current : pick.cityId));
      })
      .catch(() => {
        // No location is not an error: the default city stays selected.
      })
      .finally(() => {
        if (alive) setLocating(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const pick = useCallback((id: string) => {
    pickedByUserRef.current = true;
    setPickedByUser(true);
    setLocateNote(null);
    setSelectedId(id);
  }, []);

  const useExactLocation = useCallback(async () => {
    setLocateNote(null);
    setLocating(true);
    try {
      const found = await requestExactLocation();
      if (!found) {
        setLocateNote("Couldn't get your exact location — pick a city from the row instead.");
        return;
      }
      pickedByUserRef.current = false;
      setPickedByUser(false);
      setVisitor(found);
      setSelectedId(found.cityId);
    } finally {
      setLocating(false);
    }
  }, []);

  /**
   * The El Niño local cards follow the open station, so the whole page reads one
   * place — your nearest one when you arrive, another when you tap it.
   */
  const homeId = selectedId;

  // 92 days of history for one station — cached per city, refetched on Refresh.
  useEffect(() => {
    if (locating || !snapshots) return;
    const key = `${homeId}:${historyNonce}`;
    if (historyKey.current === key) return;
    const city = snapshots.find((s) => s.city.id === homeId)?.city;
    if (!city) return;
    historyKey.current = key;

    const cached = historyCache.current.get(homeId);
    if (cached) {
      setHistory(cached);
      return;
    }

    let alive = true;
    setHistory(null);
    fetchHistory(city)
      .then((next) => {
        historyCache.current.set(city.id, next);
        if (alive) setHistory(next);
      })
      .catch(() => {
        if (alive) setHistory(null);
      });
    return () => {
      alive = false;
    };
  }, [locating, snapshots, homeId, historyNonce]);

  // ?auto=<seconds> shortens the poll (10–600s) — handy for testing and for saving quota.
  useEffect(() => {
    const p = Number(new URLSearchParams(window.location.search).get("auto"));
    if (Number.isFinite(p) && p >= 10 && p <= 600) {
      intervalRef.current = p * 1000;
      setSecondsLeft(p);
    }
  }, []);

  // ?wx=thunder previews a backdrop without waiting for that weather.
  useEffect(() => {
    const allowed: Condition[] = [
      "clear",
      "mostly-clear",
      "cloudy",
      "overcast",
      "fog",
      "drizzle",
      "rain",
      "downpour",
      "thunder",
    ];
    const param = new URLSearchParams(window.location.search).get("wx");
    if (param === "windy") {
      // A windy day reads best against open sky, without the sun rays competing.
      setForcedWx("mostly-clear");
      setForcedWindy(true);
    } else if (param && (allowed as string[]).includes(param)) {
      setForcedWx(param as Condition);
    }
  }, []);

  // Auto-refresh every two minutes; the countdown only ticks while the tab is visible.
  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      const elapsed = Date.now() - lastFetch.current;
      const left = Math.max(0, Math.ceil((intervalRef.current - elapsed) / 1000));
      setSecondsLeft(left);
      if (left === 0) void load(true);
    }, 1000);
    return () => window.clearInterval(id);
  }, [auto, load]);

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-PH", {
          timeZone: "Asia/Manila",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }),
      );
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!snapshots) return;
    const city = snapshots.find((s) => s.city.id === selectedId)?.city;
    if (!city) return;

    const cached = hourlyCache.current.get(city.id);
    if (cached) {
      setHourly(cached);
      return;
    }

    const controller = new AbortController();
    setHourlyLoading(true);
    setHourly(null);
    fetchHourly(city, controller.signal)
      .then((next) => {
        hourlyCache.current.set(city.id, next);
        setHourly(next);
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setHourly(null);
      })
      .finally(() => setHourlyLoading(false));

    return () => controller.abort();
  }, [selectedId, snapshots]);

  const ranked = useMemo(
    () => (snapshots ? [...snapshots].sort((a, b) => b.temp - a.temp) : []),
    [snapshots],
  );

  const hottest = useMemo(() => ranked.slice(0, 5), [ranked]);
  const coldest = useMemo(() => ranked.slice(-5).reverse(), [ranked]);
  const hottestTop = ranked[0] ?? null;
  const coldestTop = ranked[ranked.length - 1] ?? null;
  const spread = hottestTop && coldestTop ? hottestTop.temp - coldestTop.temp : null;
  const mean = ranked.length ? ranked.reduce((a, b) => a + b.temp, 0) / ranked.length : null;

  // The backdrop follows the station being looked at, so tapping a chip changes the sky.
  const ambient = useMemo(
    () => snapshots?.find((s) => s.city.id === selectedId) ?? null,
    [snapshots, selectedId],
  );

  /** Shown in the outlook header while the selection is still the auto-detected station. */
  const near = useMemo(() => (visitor && !pickedByUser ? visitor : null), [visitor, pickedByUser]);

  const updatedLabel = updatedAt
    ? updatedAt.toLocaleTimeString("en-PH", {
        timeZone: "Asia/Manila",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : null;

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-4 sm:px-6 lg:px-8">
      <WeatherBackdrop
        condition={forcedWx ?? (ambient ? describe(ambient.code).condition : null)}
        isDay={ambient?.isDay ?? true}
        windy={forcedWindy || (ambient?.wind ?? 0) >= 35}
      />

      {/* top bar */}
      <SiteNav active="weather">
        <span className="hidden items-center gap-1.5 text-[11px] text-white/45 sm:flex">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          {clock ? `${clock} PHT` : "—"}
        </span>

        <button
          type="button"
              onClick={() => setAuto((v) => !v)}
              aria-pressed={auto}
              title={
                auto
                  ? "Auto-refresh is on: every 2 minutes. Click to pause."
                  : "Auto-refresh paused. Click to resume."
              }
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition ${
                auto
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15"
                  : "border-white/10 bg-white/[0.06] text-white/50 hover:text-white/80"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${auto ? "bg-emerald-400" : "bg-white/30"}`}
              />
              <span className="tnum">{auto ? mmss(secondsLeft) : "Paused"}</span>
              <span className="hidden text-[9.5px] uppercase tracking-[0.12em] opacity-70 sm:inline">
                auto
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRefreshing(true);
                hourlyCache.current.clear();
                historyCache.current.clear();
                setHistoryNonce((n) => n + 1);
                void load();
              }}
              disabled={refreshing || loading}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              <svg
                viewBox="0 0 24 24"
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M20 11a8 8 0 1 0-2.3 6.3" strokeLinecap="round" />
                <path d="M20 4.5V11h-6.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">{refreshing ? "Syncing" : "Refresh"}</span>
            </button>
      </SiteNav>

      {/* hero */}
      <section className="mt-10 grid items-end gap-8 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="rise">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/50">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-300" />
            {snapshots ? `${snapshots.length} stations nationwide` : "nationwide stations"}
          </div>

          <h1 className="mt-5 font-display text-[2.6rem] font-semibold leading-[1.03] tracking-tight sm:text-5xl lg:text-[3.6rem]">
            The Philippines,
            <br />
            <span className="gradient-text">degree by degree.</span>
          </h1>

          <p className="mt-5 max-w-xl text-[13.5px] leading-relaxed text-white/60">
            Live air temperature from Batanes to General Santos, ranked hottest to coldest. Scroll for the
            five-day outlook on any station — and how far the Pacific has pushed into super El Niño territory.
          </p>

          {staleAt && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3.5 py-2.5 text-[11.5px] text-amber-100">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
              <span>
                Showing the last saved reading from{" "}
                <span className="tnum font-medium">
                  {new Date(staleAt).toLocaleTimeString("en-PH", {
                    timeZone: "Asia/Manila",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </span>{" "}
                — the live refresh was refused.
              </span>
              <button
                type="button"
                onClick={() => {
                  setRefreshing(true);
                  hourlyCache.current.clear();
                  historyCache.current.clear();
                  setHistoryNonce((n) => n + 1);
                  void load();
                }}
                className="rounded-full border border-amber-300/30 bg-amber-400/15 px-2.5 py-1 text-[11px] font-medium text-amber-50 transition hover:bg-amber-400/25"
              >
                Try now
              </button>
            </div>
          )}

          {spread !== null && mean !== null && (
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-white/40">
              <span>
                National mean <span className="tnum font-medium text-white/75">{celsius(mean, 1)}</span>
              </span>
              <span>
                Spread <span className="tnum font-medium text-white/75">{celsius(spread, 1)}</span>
              </span>
              <span>
                Updated <span className="tnum font-medium text-white/75">{updatedLabel ?? "—"}</span> PHT
                <span className="text-white/30"> · {auto ? "auto every 2 min" : "auto paused"}</span>
              </span>
              <span className="hidden sm:inline">Source: Open-Meteo · NOAA CPC</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Hottest now" snapshot={hottestTop} tone="heat" />
          <StatTile label="Coldest now" snapshot={coldestTop} tone="chill" />
        </div>
      </section>

      {/* rain at the visitor's own coordinates */}
      <div className="mt-4">
        <RainCard
          visitor={visitor}
          stationName={visitor?.cityName ?? null}
          onUseExactLocation={() => void useExactLocation()}
          note={locateNote}
          locating={locating}
        />
      </div>

      {/* extremes */}
      <div className="mt-8 lg:mt-10">
        {error ? (
          <div className="glass flex flex-col items-start gap-3 p-6">
            <p className="font-display text-base font-semibold text-white">Weather service unreachable</p>
            <p className="max-w-lg text-[12.5px] leading-relaxed text-white/50">
              {error}. The page reads Open-Meteo directly from your browser, so a blocked network or an
              offline tab will stop the numbers from loading.
            </p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void load();
              }}
              className="mt-1 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-[12px] font-medium text-white transition hover:bg-white/15"
            >
              Try again
            </button>
          </div>
        ) : loading || !snapshots ? (
          <Skeleton />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <ExtremeCard
              title="Hottest right now"
              caption="Top five by current air temperature · tap one for its outlook"
              items={hottest}
              tone="heat"
              activeId={selectedId}
              onSelect={pick}
            />
            <ExtremeCard
              title="Coldest right now"
              caption="Uplands included — tap one for its outlook"
              items={coldest}
              tone="chill"
              activeId={selectedId}
              onSelect={pick}
            />
          </div>
        )}
      </div>

      {/* forecast */}
      <div className="mt-4">
        {snapshots ? (
          <ForecastPanel
            snapshots={snapshots}
            selectedId={selectedId}
            onSelect={pick}
            hourly={hourly}
            hourlyLoading={hourlyLoading}
            near={near}
            onUseExactLocation={useExactLocation}
            locateNote={locateNote}
          />
        ) : (
          <div className="glass h-[380px] animate-pulse p-6" />
        )}
      </div>

      {/* typhoons */}
      <div className="mt-4">
        <TyphoonPanel homeCityId={homeId} />
      </div>

      {/* el niño */}
      <div className="mt-4">
        <ElNinoPanel history={history} cityId={homeId} />
      </div>
      <footer className="mt-8 flex flex-col gap-2 border-t border-white/[0.07] pt-5 text-[11px] leading-relaxed text-white/45 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Weather: Open-Meteo (CC BY 4.0) · El Niño index: NOAA CPC Oceanic Niño Index,{" "}
          {SUPER_EL_NINO.current.year} snapshot. ONI is a 3-month running mean — not a forecast.
        </p>
        <p className="shrink-0">
          Built with Next.js · static export · <span className="text-white/50">panahon.ph</span>
        </p>
      </footer>
    </main>
  );
}
