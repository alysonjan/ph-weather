"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AUTO_MS,
  BACKOFF_MS,
  CACHE_FRESH_MS,
  MIN_MAG,
  MANUAL_COOLDOWN_MS,
  bandFor,
  depthWords,
  fetchQuakes,
  lastCallAt,
  phTime,
  readBudget,
  readCache,
  spendCall,
  summarise,
  timeAgo,
  withinDays,
  writeCache,
  type Budget,
  type Quake,
} from "@/lib/quakes";
import QuakeList from "./QuakeList";
import QuakeMap from "./QuakeMap";
import SiteNav from "./SiteNav";

const WINDOWS = [7, 30, 90] as const;
type WindowDays = (typeof WINDOWS)[number];

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function StatTile({
  label,
  value,
  unit,
  detail,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  detail: string;
  tone: "rose" | "amber" | "sky";
}) {
  const color = tone === "rose" ? "text-rose-200" : tone === "amber" ? "text-amber-200" : "text-sky-200";
  return (
    <div className="glass glass-sheen flex flex-col justify-between gap-2 p-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className={`tnum font-display text-3xl font-semibold leading-none ${color}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-white/40">{unit}</span>}
      </p>
      <p className="text-[11px] leading-snug text-white/50">{detail}</p>
    </div>
  );
}

export default function QuakeDashboard() {
  const [quakes, setQuakes] = useState<Quake[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [staleAt, setStaleAt] = useState<number | null>(null);
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_MS / 1000);
  const [clock, setClock] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [budget, setBudget] = useState<Budget>({ used: 0, cap: 200, remaining: 200 });
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [backoffLeft, setBackoffLeft] = useState(0);
  const [quotaNote, setQuotaNote] = useState<string | null>(null);

  const lastFetch = useRef(Date.now());
  const backoffUntil = useRef(0);
  const intervalRef = useRef(AUTO_MS);

  /**
   * One request covers 7, 30 and 90 days: the window switch is a client-side
   * filter. Guard rails, in order: a fresh cache costs nothing, then the daily
   * budget, then the backoff after a refusal.
   */
  const load = useCallback(async (mode: "init" | "manual" | "auto") => {
    const start = Date.now();
    lastFetch.current = start;
    setSecondsLeft(Math.round(intervalRef.current / 1000));
    if (mode !== "auto") setError(null);

    if (mode === "init") {
      const cached = readCache();
      if (cached && start - cached.savedAt < CACHE_FRESH_MS) {
        setQuakes(cached.quakes);
        setUpdatedAt(cached.savedAt);
        setBudget(readBudget());
        setLoading(false);
        return;
      }
    }

    if (start < backoffUntil.current) {
      setRefreshing(false);
      setLoading(false);
      setBudget(readBudget());
      return;
    }

    if (readBudget().remaining <= 0) {
      const cached = readCache();
      if (cached) {
        setQuakes((prev) => prev ?? cached.quakes);
        setUpdatedAt((prev) => prev ?? cached.savedAt);
        setStaleAt(cached.savedAt);
      }
      setQuotaNote(`Daily budget of ${readBudget().cap} calls is spent — showing the saved reading.`);
      setBudget(readBudget());
      setLoading(false);
      setRefreshing(false);
      return;
    }

    spendCall();
    try {
      const next = await fetchQuakes();
      setQuakes(next);
      setUpdatedAt(Date.now());
      setStaleAt(null);
      setError(null);
      setQuotaNote(null);
      writeCache(next);
    } catch (e) {
      const retryAfter = (e as Error & { retryAfterMs?: number }).retryAfterMs;
      backoffUntil.current = Date.now() + (retryAfter && retryAfter > 0 ? retryAfter : BACKOFF_MS);
      const cached = readCache();
      setQuakes((prev) => prev ?? cached?.quakes ?? null);
      if (cached) {
        setStaleAt((prev) => prev ?? cached.savedAt);
        setUpdatedAt((prev) => prev ?? cached.savedAt);
      } else {
        setError(e instanceof Error ? e.message : "Could not reach the earthquake service");
      }
    } finally {
      setBudget(readBudget());
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load("init");
  }, [load]);

  // ?auto=<seconds> (30–900) and ?days=7|30|90, for testing and for slower polling.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const seconds = Number(params.get("auto"));
    if (Number.isFinite(seconds) && seconds >= 30 && seconds <= 900) {
      intervalRef.current = seconds * 1000;
      setSecondsLeft(seconds);
    }
    const days = Number(params.get("days"));
    if (WINDOWS.includes(days as WindowDays)) setWindowDays(days as WindowDays);
  }, []);

  // One ticker drives the countdown, the relative times and the refresh cooldowns.
  useEffect(() => {
    const tick = () => {
      const t = Date.now();
      setNow(t);
      setClock(
        new Date().toLocaleTimeString("en-PH", {
          timeZone: "Asia/Manila",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }),
      );
      const left = Math.max(0, Math.ceil((intervalRef.current - (t - lastFetch.current)) / 1000));
      setSecondsLeft(left);
      setCooldownLeft(Math.max(0, Math.ceil((MANUAL_COOLDOWN_MS - (t - lastCallAt())) / 1000)));
      setBackoffLeft(Math.max(0, Math.ceil((backoffUntil.current - t) / 1000)));
      if (auto && left === 0 && document.visibilityState !== "hidden") void load("auto");
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [auto, load]);

  const visible = useMemo(() => (quakes ? withinDays(quakes, windowDays, now) : []), [quakes, windowDays, now]);
  const summary = useMemo(() => (quakes ? summarise(quakes, now) : null), [quakes, now]);
  const selected = useMemo(
    () => visible.find((q) => q.id === selectedId) ?? visible[0] ?? null,
    [visible, selectedId],
  );
  const recentAfter = now - 24 * 60 * 60 * 1000;
  const band = selected ? bandFor(selected.mag) : null;
  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString("en-PH", {
        timeZone: "Asia/Manila",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : null;

  const refreshDisabled = refreshing || loading || cooldownLeft > 0 || backoffLeft > 0;

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-4 sm:px-6 lg:px-8">
      <SiteNav active="earthquakes">
        <span className="hidden items-center gap-1.5 text-[11px] text-white/45 sm:flex">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-400" />
          </span>
          {clock ? `${clock} PHT` : "—"}
        </span>

        <button
          type="button"
          onClick={() => setAuto((v) => !v)}
          aria-pressed={auto}
          title={auto ? "Checking for new quakes every 5 minutes. Click to pause." : "Paused. Click to resume."}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition ${
            auto
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15"
              : "border-white/10 bg-white/[0.06] text-white/50 hover:text-white/80"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${auto ? "bg-emerald-400" : "bg-white/30"}`} />
          <span className="tnum">{auto ? mmss(secondsLeft) : "Paused"}</span>
          <span className="hidden text-[9.5px] uppercase tracking-[0.12em] opacity-70 sm:inline">auto</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setRefreshing(true);
            void load("manual");
          }}
          disabled={refreshDisabled}
          title={
            cooldownLeft > 0
              ? `Next manual check in ${cooldownLeft}s — the service is free, so calls are spaced out.`
              : backoffLeft > 0
                ? `Service asked us to wait ${mmss(backoffLeft)}.`
                : "Check for new earthquakes now"
          }
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
          <span className="hidden sm:inline">{refreshing ? "Checking" : "Refresh"}</span>
        </button>
      </SiteNav>

      {/* hero */}
      <section className="mt-10 grid items-end gap-6 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rise">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/50">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            {quakes ? `${visible.length} quakes · last ${windowDays} days` : "loading the catalogue"}
          </div>

          <h1 className="mt-5 font-display text-[2.6rem] font-semibold leading-[1.03] tracking-tight sm:text-5xl lg:text-[3.6rem]">
            The Philippines,
            <br />
            <span className="gradient-text">quake by quake.</span>
          </h1>

          <p className="mt-5 max-w-xl text-[13.5px] leading-relaxed text-white/60">
            Every earthquake PHIVOLCS recorded in the last {windowDays} days, magnitude {MIN_MAG} and up.
            The glow shows where they cluster; tap a dot for the details.
          </p>

          {(staleAt || quotaNote) && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3.5 py-2.5 text-[11.5px] text-amber-100">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
              <span>
                {quotaNote ??
                  `Showing the last saved reading from ${staleAt ? phTime(staleAt) : "earlier"} — the live check didn't go through.`}
              </span>
              <button
                type="button"
                onClick={() => {
                  backoffUntil.current = 0;
                  setRefreshing(true);
                  void load("manual");
                }}
                className="rounded-full border border-amber-300/30 bg-amber-400/15 px-2.5 py-1 text-[11px] font-medium text-amber-50 transition hover:bg-amber-400/25"
              >
                Try now
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <StatTile
            label="Latest"
            value={summary?.latest ? `M${summary.latest.mag.toFixed(1)}` : "—"}
            detail={
              summary?.latest
                ? `${summary.latest.region} · ${timeAgo(summary.latest.time, now)}`
                : "waiting for the catalogue"
            }
            tone="rose"
          />
          <StatTile
            label="Strongest this week"
            value={summary?.strongest7d ? `M${summary.strongest7d.mag.toFixed(1)}` : "—"}
            detail={
              summary?.strongest7d
                ? `${summary.strongest7d.region} · ${timeAgo(summary.strongest7d.time, now)}`
                : "nothing in the last 7 days"
            }
            tone="amber"
          />
          <StatTile
            label="Last 24 hours"
            value={summary ? String(summary.last24h) : "—"}
            unit="quakes"
            detail={
              summary && summary.last24h === 0
                ? "Quiet day so far"
                : `Magnitude ${MIN_MAG} and up, nationwide`
            }
            tone="sky"
          />
        </div>
      </section>

      {error ? (
        <div className="glass mt-6 flex flex-col items-start gap-3 p-6">
          <p className="font-display text-base font-semibold text-white">Earthquake service unreachable</p>
          <p className="max-w-lg text-[12.5px] leading-relaxed text-white/50">
            {error}. This page reads the EMSC catalogue directly from your browser, so a blocked network or
            an offline tab will stop the numbers from loading.
          </p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              backoffUntil.current = 0;
              void load("manual");
            }}
            className="mt-1 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-[12px] font-medium text-white transition hover:bg-white/15"
          >
            Try again
          </button>
        </div>
      ) : loading || !quakes ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="glass h-[520px] animate-pulse" />
          <div className="glass h-[520px] animate-pulse" />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          {/* map + selected event */}
          <section className="glass glass-sheen lift overflow-hidden p-4 sm:p-5">
            <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-rose-400" />
                  <h2 className="font-display text-lg font-semibold tracking-tight text-white">Where they were</h2>
                </div>
                <p className="mt-1 text-[12.5px] text-white/50">
                  {visible.length} {visible.length === 1 ? "quake" : "quakes"} in the last {windowDays} days ·{" "}
                  {summary && summary.last24h === 0
                    ? "none in the last 24 hours"
                    : `${summary?.last24h ?? 0} in the last 24 hours`}
                </p>
              </div>

              <div className="flex rounded-full border border-white/10 bg-white/[0.04] p-0.5">
                {WINDOWS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setWindowDays(days)}
                    aria-pressed={windowDays === days}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      windowDays === days ? "bg-white/15 text-white" : "text-white/45 hover:text-white/75"
                    }`}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </header>

            <QuakeMap quakes={visible} selectedId={selected?.id ?? null} onSelect={setSelectedId} recentAfter={recentAfter} />

            {selected && band && (
              <div className="mt-3.5 grid gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                <div className="flex items-center gap-3">
                  <span
                    className="tnum grid h-14 w-14 shrink-0 place-items-center rounded-2xl font-display text-xl font-semibold text-[#0a1024]"
                    style={{ background: band.color }}
                  >
                    {selected.mag.toFixed(1)}
                  </span>
                  <div className="min-w-0 sm:hidden">
                    <p className="truncate font-display text-[15px] font-semibold text-white">{selected.region}</p>
                    <p className="text-[11px] text-white/45">{timeAgo(selected.time, now)} · {depthWords(selected.depth)}</p>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="hidden truncate font-display text-[15px] font-semibold text-white sm:block">
                    {selected.region}
                    <span className="ml-2 text-[11px] font-normal text-white/40">
                      {phTime(selected.time)} PHT · {timeAgo(selected.time, now)}
                    </span>
                  </p>
                  <p className="text-[12px] leading-relaxed text-white/60">
                    <span className="font-medium text-white/80">{band.meaning}.</span>{" "}
                    {depthWords(selected.depth)} focus at {Math.round(selected.depth)} km · reported by{" "}
                    {selected.source}
                    {selected.magType ? ` (${selected.magType})` : ""}.
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* the list */}
          <section className="glass glass-sheen lift flex flex-col overflow-hidden p-4 sm:p-5">
            <header className="mb-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-300" />
                <h2 className="font-display text-lg font-semibold tracking-tight text-white">Most recent</h2>
              </div>
              <p className="mt-1 text-[12.5px] text-white/50">
                {visible.length
                  ? `Newest ${Math.min(10, visible.length)} of ${visible.length} in this window. Tap one to place it.`
                  : "Nothing recorded in this window."}
              </p>
            </header>

            {visible.length ? (
              <QuakeList quakes={visible.slice(0, 10)} selectedId={selected?.id ?? null} onSelect={setSelectedId} now={now} />
            ) : (
              <p className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-6 text-center text-[12px] text-white/40">
                Try a longer window.
              </p>
            )}

            <div className="mt-auto pt-4 text-[10.5px] leading-relaxed text-white/35">
              Magnitude, depth and place come from the agency that reviewed the event — PHIVOLCS for most
              Philippine quakes. Small events (below M{MIN_MAG}) are not in this catalogue.
            </div>
          </section>
        </div>
      )}

      <footer className="mt-8 flex flex-col gap-2 border-t border-white/[0.07] pt-5 text-[11px] leading-relaxed text-white/45 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Earthquakes: PHIVOLCS solutions via the EMSC SeismicPortal catalogue (free FDSN service).
          {updatedLabel ? ` Updated ${updatedLabel} PHT.` : ""} Updated {auto ? "every 5 min" : "manually"}.
        </p>
        <p className="shrink-0 text-white/35">
          {budget.used} of {budget.cap} API calls today · <span className="text-white/50">panahon.ph</span>
        </p>
      </footer>
    </main>
  );
}
