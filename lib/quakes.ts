/**
 * Philippine earthquakes, from the EMSC catalogue.
 *
 * Why EMSC and not PHIVOLCS directly: PHIVOLCS publishes a 2 MB HTML table and
 * no API (no CORS either), while EMSC's FDSN service is free, key-less, CORS
 * open, and tags each event with the agency that authored the solution — most PH
 * events carry `auth: "PIVS"`, i.e. PHIVOLCS itself. So this is the official
 * reading, delivered over an endpoint a static page can actually call.
 *
 * One request covers every window the UI shows: the catalogue is small enough
 * (≈740 events for 90 days at M2.5+) that 7/30/90 days are just filters.
 */

const EMSC_QUERY = "https://www.seismicportal.eu/fdsnws/event/1/query";

/** Box that contains the Philippine archipelago plus its offshore seismic zones. */
export const PH_BOX = { minLat: 4, maxLat: 22, minLon: 114, maxLon: 128 };

export const WINDOW_DAYS = 90;
export const MIN_MAG = 2.5;
const LIMIT = 2000;

/** A cached payload is used without touching the network for this long. */
export const CACHE_FRESH_MS = 10 * 60 * 1000;
/** Older than this and the numbers are too stale to show at all. */
export const CACHE_MAX_MS = 12 * 60 * 60 * 1000;
/** Requests per browser per day, across reloads and tabs. */
export const DAILY_CAP = 200;
/** Manual refresh cooldown. */
export const MANUAL_COOLDOWN_MS = 60 * 1000;
/** Poll interval: earthquakes are not a per-second phenomenon. */
export const AUTO_MS = 5 * 60 * 1000;
/** After a 429 or a failed call, back off to this for the rest of the session. */
export const BACKOFF_MS = 15 * 60 * 1000;

export interface Quake {
  id: string;
  /** Epoch ms. */
  time: number;
  updated: number | null;
  lat: number;
  lon: number;
  /** Kilometres, positive downwards. */
  depth: number;
  mag: number;
  magType: string | null;
  /** "Mindanao, Philippines" */
  region: string;
  /** The agency that authored the solution — PHIVOLCS for most PH events. */
  source: string;
}

interface EmscFeature {
  id: string;
  geometry: { type: string; coordinates: number[] };
  properties: {
    mag: number | null;
    magtype: string | null;
    depth: number | null;
    time: string;
    lastupdate: string | null;
    flynn_region: string | null;
    auth: string | null;
    unid: string;
    evtype: string | null;
  };
}

const AGENCY: Record<string, string> = {
  PIVS: "PHIVOLCS",
  EMSC: "EMSC",
  NEIC: "USGS",
  BMKG: "BMKG",
  MMD: "MetMalaysia",
  JMA: "JMA",
  CPPT: "CPPT",
};

/** V8 accepts loose fractional seconds, but don't rely on it. */
function parseTime(value: string | null): number | null {
  if (!value) return null;
  const normalised = value.replace(/\.(\d+)Z$/, (_m, f: string) => `.${f.padEnd(3, "0").slice(0, 3)}Z`);
  const ms = Date.parse(normalised);
  return Number.isFinite(ms) ? ms : null;
}

/** "MINDANAO, PHILIPPINES" reads like a shout; title case it for display. */
function titleCaseRegion(value: string | null): string {
  if (!value) return "Philippines";
  return value
    .toLowerCase()
    .split(/(\s|,|-)/)
    .map((part) => (/^[a-z]/.test(part) ? part[0].toUpperCase() + part.slice(1) : part))
    .join("")
    .replace(/\bIsl\b/g, "Islands")
    .replace(/\bReg\b/g, "Region");
}

export function quakeUrl(now = Date.now()): string {
  const start = new Date(now - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    format: "json",
    starttime: start,
    minlatitude: String(PH_BOX.minLat),
    maxlatitude: String(PH_BOX.maxLat),
    minlongitude: String(PH_BOX.minLon),
    maxlongitude: String(PH_BOX.maxLon),
    minmagnitude: String(MIN_MAG),
    orderby: "time",
    limit: String(LIMIT),
  });
  return `${EMSC_QUERY}?${params.toString()}`;
}

function toQuake(feature: EmscFeature): Quake | null {
  const p = feature.properties;
  const time = parseTime(p?.time);
  const coords = feature.geometry?.coordinates;
  if (time == null || !Array.isArray(coords) || coords.length < 2) return null;
  const [lon, lat, depth] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const mag = p.mag == null ? null : Number(p.mag);
  if (mag == null || !Number.isFinite(mag)) return null;

  return {
    id: p.unid || feature.id,
    time,
    updated: parseTime(p.lastupdate),
    lat,
    lon,
    depth: Math.abs(depth ?? p.depth ?? 0),
    mag,
    magType: p.magtype ?? null,
    region: titleCaseRegion(p.flynn_region),
    source: AGENCY[p.auth ?? ""] ?? p.auth ?? "EMSC",
  };
}

/** Newest first, no duplicate solutions for the same event. */
export function normalise(features: EmscFeature[]): Quake[] {
  const seen = new Set<string>();
  const out: Quake[] = [];
  for (const feature of features) {
    const quake = toQuake(feature);
    if (!quake) continue;
    const key = `${quake.time}:${quake.lat.toFixed(2)}:${quake.lon.toFixed(2)}:${quake.mag}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(quake);
  }
  return out.sort((a, b) => b.time - a.time);
}

export async function fetchQuakes(signal?: AbortSignal): Promise<Quake[]> {
  const res = await fetch(quakeUrl(), {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after"));
    const error = new Error("The earthquake service is rate-limiting this browser.");
    (error as Error & { retryAfterMs?: number }).retryAfterMs = Number.isFinite(retry)
      ? retry * 1000
      : BACKOFF_MS;
    throw error;
  }
  if (!res.ok) throw new Error(`Earthquake service returned ${res.status}`);
  const data = (await res.json()) as { features?: EmscFeature[] };
  const quakes = normalise(data.features ?? []);
  if (!quakes.length) throw new Error("The earthquake service returned no events");
  return quakes;
}

/* ---------------------------------------------------------------- storage */

const CACHE_KEY = "panahon:quakes:v1";
const CALLS_KEY = "panahon:quakes:calls:v1";
const LAST_CALL_KEY = "panahon:quakes:lastcall:v1";

export interface QuakeCache {
  savedAt: number;
  quakes: Quake[];
}

export function readCache(): QuakeCache | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuakeCache;
    if (!Array.isArray(parsed.quakes) || !parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > CACHE_MAX_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCache(quakes: Quake[]): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), quakes }));
  } catch {
    // Quota or private mode: the cache is a nicety.
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface Budget {
  used: number;
  cap: number;
  remaining: number;
}

export function readBudget(): Budget {
  let used = 0;
  try {
    const raw = window.localStorage.getItem(CALLS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { date: string; n: number };
      if (parsed.date === today()) used = parsed.n;
    }
  } catch {
    used = 0;
  }
  return { used, cap: DAILY_CAP, remaining: Math.max(0, DAILY_CAP - used) };
}

function noteCall(): void {
  const budget = readBudget();
  try {
    window.localStorage.setItem(CALLS_KEY, JSON.stringify({ date: today(), n: budget.used + 1 }));
    window.localStorage.setItem(LAST_CALL_KEY, String(Date.now()));
  } catch {
    // Ignore: the cap is a guard rail, not a contract.
  }
}

export function lastCallAt(): number {
  try {
    const raw = window.localStorage.getItem(LAST_CALL_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

/** Marks a call and reports whether the daily budget allows one at all. */
export function spendCall(): boolean {
  if (readBudget().remaining <= 0) return false;
  noteCall();
  return true;
}

/* ------------------------------------------------------------- presenting */

export interface MagBand {
  key: "tiny" | "light" | "felt" | "strong" | "major";
  label: string;
  meaning: string;
  /** Dot fill on the map. */
  color: string;
  /** Soft glow for the heat layer. */
  glow: string;
}

const BANDS: (MagBand & { from: number })[] = [
  {
    from: 6,
    key: "major",
    label: "M6+",
    meaning: "Major — destructive close to the epicentre",
    color: "#fb7185",
    glow: "rgba(251,113,133,0.55)",
  },
  {
    from: 5,
    key: "strong",
    label: "M5–5.9",
    meaning: "Strong — damage near the epicentre",
    color: "#fb923c",
    glow: "rgba(251,146,60,0.5)",
  },
  {
    from: 4,
    key: "felt",
    label: "M4–4.9",
    meaning: "Felt widely; light damage possible",
    color: "#fcd34d",
    glow: "rgba(252,211,77,0.45)",
  },
  {
    from: 3,
    key: "light",
    label: "M3–3.9",
    meaning: "Often felt nearby, rarely any damage",
    color: "#7dd3fc",
    glow: "rgba(125,211,252,0.4)",
  },
  {
    from: -Infinity,
    key: "tiny",
    label: "below M3",
    meaning: "Usually only instruments notice",
    color: "#67e8f9",
    glow: "rgba(103,232,249,0.32)",
  },
];

export function bandFor(mag: number): MagBand {
  return BANDS.find((b) => mag >= b.from)!;
}

export const MAG_BANDS: MagBand[] = BANDS.map(({ from: _from, ...rest }) => rest);

export function depthWords(depth: number): string {
  if (depth < 70) return "shallow";
  if (depth < 300) return "intermediate";
  return "deep";
}

/** Short, human distance in time. */
export function timeAgo(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function phTime(ms: number): string {
  return new Date(ms).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function withinDays(quakes: Quake[], days: number, now = Date.now()): Quake[] {
  const from = now - days * 86_400_000;
  return quakes.filter((q) => q.time >= from);
}

export interface QuakeSummary {
  last24h: number;
  last7d: number;
  strongest7d: Quake | null;
  latest: Quake | null;
  maxMag: number;
}

export function summarise(quakes: Quake[], now = Date.now()): QuakeSummary {
  const day = withinDays(quakes, 1, now);
  const week = withinDays(quakes, 7, now);
  const strongest7d = week.reduce<Quake | null>((best, q) => (!best || q.mag > best.mag ? q : best), null);
  return {
    last24h: day.length,
    last7d: week.length,
    strongest7d,
    latest: quakes[0] ?? null,
    maxMag: quakes.reduce((max, q) => Math.max(max, q.mag), 0),
  };
}
