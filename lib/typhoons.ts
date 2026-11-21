/**
 * Tropical cyclones around the Philippines, from GDACS.
 *
 * GDACS publishes the official track as polygons: one ring per 12-hour step per
 * wind threshold (60 / 90 / 120 km/h), plus the forecast cone. That is more than
 * enough for a schematic map, and it is free, key-less and CORS-open — verified
 * with an Origin header. PAGASA's own bulletins have no API and no CORS, and the
 * PAR boundary they monitor is a published set of coordinates, so we draw that
 * ourselves.
 *
 * Rate limits: a storm moves on a 12-hour cadence, so nothing here needs to poll
 * often. The list is fetched at most every 30 minutes and the geometry (≈225 KB
 * per storm) is cached alongside it.
 */

import { CITIES, type City } from "./cities";
import { distanceKm } from "./geo";

const GDACS = "https://www.gdacs.org/gdacsapi/api/events";

/** PAGASA's monitoring area, exactly as published. */
export const PAR: [number, number][] = [
  [115, 5],
  [115, 15],
  [120, 21],
  [120, 25],
  [135, 25],
  [135, 5],
];

/** Wider frame for the map: PAR plus room for a storm approaching it. */
export const TYPHOON_BOX = { minLon: 108, maxLon: 145, minLat: 2, maxLat: 32 };

export const REFRESH_MS = 30 * 60 * 1000;
export const CACHE_TTL_MS = 30 * 60 * 1000;

/** Where a storm is, in the terms the panel talks about. */
export type StormPhase = "inside" | "approaching" | "outside" | "past";

export interface StormStep {
  time: number;
  lat: number;
  lon: number;
  /** Wind-radii in km, from the GDACS rings. */
  r60: number;
  r90: number;
  r120: number;
  forecast: boolean;
}

export interface Storm {
  id: string;
  episode: number;
  name: string;
  /** Max sustained wind in km/h; null when the record has a track but no intensity. */
  wind: number | null;
  from: number;
  to: number;
  active: boolean;
  steps: StormStep[];
}

export interface StormReport {
  storm: Storm;
  phase: StormPhase;
  /** Step being presented as "now" — the latest non-forecast one, else the first. */
  current: StormStep | null;
  /** km/h and compass words, from the last real movement. */
  speedKmh: number | null;
  heading: string | null;
  /** Nearest Philippine station to the current position. */
  nearest: { city: City; km: number } | null;
  /** Compass word for the direction from that station to the storm ("east" = storm is east of it). */
  fromCityDir: string | null;
  /** Hours until the centre crosses into PAR, when it is still outside. */
  entersInHours: number | null;
  /** Closest the centre gets to the given city, across all steps. */
  closest: { city: City; km: number; time: number } | null;
  category: { label: string; meaning: string; tone: "rose" | "amber" | "sky" };
}

interface GdacsFeature {
  geometry?: { type: string; coordinates: number[] };
  properties: Record<string, unknown> & {
    eventid?: number;
    episodeid?: number;
    eventname?: string;
    alertlevel?: string;
    country?: string;
    fromdate?: string;
    todate?: string;
    iscurrent?: boolean;
    severitydata?: { severity?: number; severitytext?: string; severityunit?: string };
  };
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const COMPASS_WORDS: Record<string, string> = {
  N: "north",
  NNE: "north-northeast",
  NE: "northeast",
  ENE: "east-northeast",
  E: "east",
  ESE: "east-southeast",
  SE: "southeast",
  SSE: "south-southeast",
  S: "south",
  SSW: "south-southwest",
  SW: "southwest",
  WSW: "west-southwest",
  W: "west",
  WNW: "west-northwest",
  NW: "northwest",
  NNW: "north-northwest",
};

export function compassWord(bearing: number): string {
  return COMPASS_WORDS[COMPASS[Math.round((((bearing % 360) + 360) % 360) / 22.5) % 16]] ?? "north";
}

/** PAGASA's wind bands, in km/h. */
export function categoryFor(wind: number | null): StormReport["category"] {
  if (wind == null)
    return { label: "Track only", meaning: "This record has a track but no wind speed", tone: "sky" };
  if (wind >= 185)
    return {
      label: "Super typhoon",
      meaning: "Winds above 185 km/h — expect widespread damage near the track",
      tone: "rose",
    };
  if (wind >= 118)
    return { label: "Typhoon", meaning: "Winds 118–184 km/h — damaging winds near the centre", tone: "rose" };
  if (wind >= 89)
    return { label: "Severe tropical storm", meaning: "Winds 89–117 km/h — small trees down, some roofs", tone: "amber" };
  if (wind >= 62)
    return { label: "Tropical storm", meaning: "Winds 62–88 km/h — enough to break branches", tone: "amber" };
  return { label: "Tropical depression", meaning: "Winds below 62 km/h — mostly rain so far", tone: "sky" };
}

export function pointInPar(lon: number, lat: number): boolean {
  // Ray casting on the six published PAR vertices.
  let inside = false;
  for (let i = 0, j = PAR.length - 1; i < PAR.length; j = i++) {
    const [xi, yi] = PAR[i];
    const [xj, yj] = PAR[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function meanRing(ring: number[][]): { lon: number; lat: number; radiusKm: number } | null {
  if (!ring?.length) return null;
  let lon = 0;
  let lat = 0;
  for (const [x, y] of ring) {
    lon += x;
    lat += y;
  }
  lon /= ring.length;
  lat /= ring.length;
  // Mean distance from the centre to the ring, in km.
  const radii = ring.map(([x, y]) => distanceKm({ lat, lon }, { lat: y, lon: x }));
  const radiusKm = radii.length ? radii.reduce((a, b) => a + b, 0) / radii.length : 0;
  return { lon, lat, radiusKm };
}

function parseStepLabel(label: string, year: number): number | null {
  const match = /^(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/.exec(label.trim());
  if (!match) return null;
  const [, dd, mm, hh, min] = match;
  // A season can straddle New Year: roll the year forward for early months.
  const y = Number(mm) < 6 ? year + 1 : year;
  return Date.UTC(y, Number(mm) - 1, Number(dd), Number(hh) - 8, Number(min));
}

interface GeometryFeature {
  geometry?: { type: string; coordinates: unknown };
  properties?: { Class?: string; polygonlabel?: string };
}

/** Turn one storm's geometry FeatureCollection into ordered 12-hour steps. */
export function stepsFromGeometry(features: GeometryFeature[], fromMs: number, now = Date.now()): StormStep[] {
  const year = new Date(fromMs).getUTCFullYear();
  const byTime = new Map<number, { r60?: number; r90?: number; r120?: number; lon?: number; lat?: number }>();

  for (const feature of features) {
    const label = feature.properties?.polygonlabel ?? "";
    const time = parseStepLabel(label, year);
    if (time == null) continue;
    const cls = feature.properties?.Class ?? "";
    const rings = (feature.geometry?.coordinates ?? []) as number[][][];
    const ring = rings[0];
    const centre = meanRing(ring);
    if (!centre) continue;

    const entry = byTime.get(time) ?? {};
    entry.lon = centre.lon;
    entry.lat = centre.lat;
    if (cls === "Poly_Green") entry.r60 = centre.radiusKm;
    if (cls === "Poly_Orange") entry.r90 = centre.radiusKm;
    if (cls === "Poly_Red") entry.r120 = centre.radiusKm;
    byTime.set(time, entry);
  }

  return [...byTime.entries()]
    .filter(([, v]) => typeof v.lon === "number" && typeof v.lat === "number")
    .sort((a, b) => a[0] - b[0])
    .map(([time, v]) => ({
      time,
      lon: v.lon!,
      lat: v.lat!,
      r60: v.r60 ?? 0,
      r90: v.r90 ?? 0,
      r120: v.r120 ?? 0,
      forecast: time > now,
    }));
}

function pickCurrent(steps: StormStep[], now: number): StormStep | null {
  if (!steps.length) return null;
  let best = steps[0];
  for (const step of steps) {
    if (step.time <= now) best = step;
  }
  return best;
}

function movement(steps: StormStep[], current: StormStep | null): { speedKmh: number | null; bearing: number | null } {
  if (!current) return { speedKmh: null, bearing: null };
  const index = steps.findIndex((s) => s.time === current.time);
  const previous = index > 0 ? steps[index - 1] : null;
  if (!previous) return { speedKmh: null, bearing: null };

  const km = distanceKm({ lat: previous.lat, lon: previous.lon }, { lat: current.lat, lon: current.lon });
  const hours = Math.max(1, (current.time - previous.time) / 3_600_000);
  const bearing = bearingBetween(previous, current);
  return { speedKmh: Math.round(km / hours), bearing };
}

function bearingBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** When (in hours) the track first enters PAR, following the existing steps. */
function hoursUntilPar(steps: StormStep[], current: StormStep | null, now: number): number | null {
  if (!current || pointInPar(current.lon, current.lat)) return 0;
  for (const step of steps) {
    if (step.time <= current.time) continue;
    if (pointInPar(step.lon, step.lat)) return Math.max(0, Math.round((step.time - now) / 3_600_000));
  }
  return null;
}

export function buildReport(
  storm: Storm,
  homeCityId: string | null,
  now = Date.now(),
): StormReport {
  const current = pickCurrent(storm.steps, now);
  const { speedKmh, bearing } = movement(storm.steps, current);
  const inside = current ? pointInPar(current.lon, current.lat) : false;

  const nearest = current
    ? CITIES.map((city) => ({ city, km: distanceKm({ lat: current.lat, lon: current.lon }, city) })).sort(
        (a, b) => a.km - b.km,
      )[0]
    : null;

  // Which way the storm sits from the station nearest it: "420 km east of Basco".
  const fromCityDir =
    current && nearest
      ? compassWord(bearingBetween(nearest.city, { lat: current.lat, lon: current.lon }))
      : null;

  const home = CITIES.find((c) => c.id === homeCityId) ?? null;
  let closest: StormReport["closest"] = null;
  if (home) {
    for (const step of storm.steps) {
      const km = distanceKm({ lat: step.lat, lon: step.lon }, home);
      if (!closest || km < closest.km) closest = { city: home, km, time: step.time };
    }
  }

  const enters = hoursUntilPar(storm.steps, current, now);
  // GDACS keeps an event "current" for days after it fades; a track older than
  // 36 hours is history, not a live storm.
  const recent = current != null && now - current.time < 36 * 3_600_000;
  const phase: StormPhase = !recent ? "past" : inside ? "inside" : enters != null ? "approaching" : "outside";

  return {
    storm,
    phase,
    current,
    speedKmh,
    heading: bearing == null ? null : compassWord(bearing),
    nearest: nearest ?? null,
    fromCityDir,
    entersInHours: enters,
    closest,
    category: categoryFor(storm.wind),
  };
}

/* ------------------------------------------------------------------ fetch */

interface Candidate {
  id: string;
  episode: number;
  name: string;
  wind: number | null;
  from: number;
  to: number;
  active: boolean;
  lon: number;
  lat: number;
}

function toCandidate(feature: GdacsFeature): Candidate | null {
  const p = feature.properties;
  const coords = feature.geometry?.coordinates;
  const id = p.eventid;
  if (id == null || !coords) return null;
  const wind = Number(p.severitydata?.severity ?? 0);
  const from = Date.parse(String(p.fromdate));
  const to = Date.parse(String(p.todate));
  if (!Number.isFinite(wind) || !Number.isFinite(from)) return null;
  return {
    id: String(id),
    episode: Number(p.episodeid ?? 1),
    name: String(p.eventname ?? p.name ?? "Unnamed"),
    wind,
    from,
    to: Number.isFinite(to) ? to : from,
    active: Boolean(p.iscurrent),
    lon: coords[0],
    lat: coords[1],
  };
}

/** Storms in the western Pacific / Philippine Sea during the last `days`. */
export async function fetchCandidates(days = 45, signal?: AbortSignal): Promise<Candidate[]> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const url = `${GDACS}/geteventlist/SEARCH?fromDate=${from.toISOString().slice(0, 10)}&toDate=${to
    .toISOString()
    .slice(0, 10)}&eventlist=TC`;
  const res = await fetch(url, { signal, cache: "no-store", headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`GDACS returned ${res.status}`);
  const data = (await res.json()) as { features?: GdacsFeature[] };
  return (data.features ?? [])
    .map(toCandidate)
    .filter((c): c is Candidate => c !== null)
    .filter((c) => c.lon >= 95 && c.lon <= 148 && c.lat >= 0 && c.lat <= 32)
    .sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || b.to - a.to);
}

export async function fetchStorm(candidate: Candidate, signal?: AbortSignal): Promise<Storm> {
  const url = `${GDACS.replace("/events", "/polygons")}/getgeometry?eventtype=TC&eventid=${candidate.id}&episodeid=${candidate.episode}`;
  const res = await fetch(url, { signal, cache: "no-store", headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`GDACS track returned ${res.status}`);
  const data = (await res.json()) as { features?: GeometryFeature[] };
  const steps = stepsFromGeometry(data.features ?? [], candidate.from);
  if (!steps.length) throw new Error("GDACS track had no steps");
  return {
    id: candidate.id,
    episode: candidate.episode,
    name: candidate.name,
    wind: candidate.wind,
    from: candidate.from,
    to: candidate.to,
    active: candidate.active,
    steps,
  };
}

/**
 * Fetch a storm by id + episode alone, so `?storm=` can show any storm in the
 * record — including one older than the candidate window. One extra call for the
 * name and intensity, which the geometry response does not carry.
 */
export async function fetchStormById(id: string, episode: number, signal?: AbortSignal): Promise<Storm> {
  const url = `${GDACS}/geteventdata?eventtype=TC&eventid=${id}&episodeid=${episode}`;
  const res = await fetch(url, { signal, cache: "no-store", headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`GDACS event returned ${res.status}`);
  const data = (await res.json()) as GdacsFeature;
  const p = data.properties ?? {};
  const from = Date.parse(String(p.fromdate ?? ""));
  const to = Date.parse(String(p.todate ?? ""));
  const wind = Number(p.severitydata?.severity);

  return fetchStorm(
    {
      id,
      episode,
      name: String(p.eventname ?? `Storm ${id}`),
      wind: Number.isFinite(wind) ? wind : null,
      from: Number.isFinite(from) ? from : Date.now() - 7 * 86_400_000,
      to: Number.isFinite(to) ? to : Date.now(),
      active: Boolean(p.iscurrent),
      lon: 0,
      lat: 0,
    },
    signal,
  );
}

/* ---------------------------------------------------------------- caching */
const CACHE_KEY = "panahon:typhoon:v1";
const CALLS_KEY = "panahon:typhoon:calls:v1";

export interface StormCache {
  savedAt: number;
  storm: Storm | null;
  candidates: Candidate[];
}

export function readStormCache(): StormCache | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StormCache;
    if (!parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > 12 * 60 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStormCache(storm: Storm | null, candidates: Candidate[]): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), storm, candidates }));
  } catch {
    // Cache is a nicety.
  }
}

export function staleStormCache(): boolean {
  const cached = readStormCache();
  return Boolean(cached && Date.now() - cached.savedAt > CACHE_TTL_MS);
}

export function readTyphoonCalls(): number {
  try {
    const raw = window.localStorage.getItem(CALLS_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { date: string; n: number };
    return parsed.date === new Date().toISOString().slice(0, 10) ? parsed.n : 0;
  } catch {
    return 0;
  }
}

export function noteTyphoonCalls(n: number): void {
  try {
    window.localStorage.setItem(
      CALLS_KEY,
      JSON.stringify({ date: new Date().toISOString().slice(0, 10), n: readTyphoonCalls() + n }),
    );
  } catch {
    // Ignore.
  }
}
