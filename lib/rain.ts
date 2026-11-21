/**
 * Rain at the visitor's own coordinates, on a 15-minute clock.
 *
 * One Open-Meteo request answers the whole card: current precipitation plus the
 * next 12 hours in 15-minute steps (≈1.8 KB for 12 h). That is a model
 * forecast, not radar — here in Cebu the grid cell Open-Meteo answers for sits
 * about 7 km from the requested point, so the honest unit is "your part of the
 * city", not your street. The copy says so.
 *
 * The place name comes from Nominatim (OSM), which is the only free reverse
 * geocoder tested that resolves a landmark such as "Cebu I.T. Park" rather than
 * just the city. Their policy is one request per second, so it is cached per
 * position for a day.
 */

const FORECAST = "https://api.open-meteo.com/v1/forecast";
const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";

/** 15-minute steps for the next 12 hours. */
const INTERVALS = 48;
/** A cached reading is used without a request for this long. */
export const CACHE_FRESH_MS = 10 * 60 * 1000;
export const CACHE_MAX_MS = 6 * 60 * 60 * 1000;
/** Requests per browser per day, this card alone. */
export const DAILY_CAP = 150;
export const AUTO_MS = 10 * 60 * 1000;
/** Anything below this is noise in the model output. */
const WET_MM = 0.1;

export interface Coords {
  lat: number;
  lon: number;
}

export interface RainPoint {
  /** Epoch ms, start of the 15-minute step. */
  time: number;
  /** Millimetres over that 15 minutes. */
  mm: number;
  /** Chance of any precipitation, %. */
  prob: number;
}

export interface RainVerdict {
  kind: "raining" | "soon" | "maybe" | "dry";
  /** One sentence, the answer. */
  headline: string;
  /** The supporting line — intensity, duration, or the caveat. */
  detail: string;
  startsAt: number | null;
  endsAt: number | null;
}

export interface RainReport {
  coords: Coords;
  /** Model grid point Open-Meteo actually answered for. */
  grid: Coords & { km: number };
  points: RainPoint[];
  nowMm: number;
  verdict: RainVerdict;
}

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  current?: { time: string; precipitation?: number; rain?: number };
  minutely_15?: {
    time?: string[];
    precipitation?: (number | null)[];
    precipitation_probability?: (number | null)[];
  };
}

/** Times come back in the requested timezone, without an offset. */
function localToEpoch(value: string): number | null {
  const ms = Date.parse(`${value}:00+08:00`);
  return Number.isFinite(ms) ? ms : null;
}

export function distanceKm(a: Coords, b: Coords): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function mmPerHour(mmPerStep: number): number {
  return mmPerStep * 4;
}

/** Rain intensity in words, from millimetres per 15 minutes. */
export function intensityWord(mm: number): string {
  if (mm < 0.4) return "light";
  if (mm < 1.2) return "moderate";
  return "heavy";
}

function phClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function roundToFive(minutes: number): number {
  return Math.max(5, Math.round(minutes / 5) * 5);
}

export function rainUrl(coords: Coords): string {
  const params = new URLSearchParams({
    latitude: coords.lat.toFixed(4),
    longitude: coords.lon.toFixed(4),
    current: "precipitation,rain,weather_code",
    minutely_15: "precipitation,precipitation_probability",
    forecast_minutely_15: String(INTERVALS),
    timezone: "Asia/Manila",
  });
  return `${FORECAST}?${params.toString()}`;
}

export function parseRain(data: OpenMeteoResponse, requested: Coords, now = Date.now()): RainReport {
  const times = data.minutely_15?.time ?? [];
  const precip = data.minutely_15?.precipitation ?? [];
  const prob = data.minutely_15?.precipitation_probability ?? [];

  const points: RainPoint[] = [];
  for (let i = 0; i < times.length; i += 1) {
    const time = localToEpoch(times[i]);
    if (time == null) continue;
    points.push({
      time,
      mm: Number(precip[i] ?? 0) || 0,
      prob: Number(prob[i] ?? 0) || 0,
    });
  }

  const grid = {
    lat: data.latitude,
    lon: data.longitude,
    km: Math.round(distanceKm(requested, { lat: data.latitude, lon: data.longitude }) * 10) / 10,
  };

  return {
    coords: requested,
    grid,
    points,
    nowMm: Number(data.current?.precipitation ?? 0) || 0,
    verdict: verdictFor(points, Number(data.current?.precipitation ?? 0) || 0, now),
  };
}

/** The whole card is this function: what should a person be told right now? */
export function verdictFor(points: RainPoint[], nowMm: number, now = Date.now()): RainVerdict {
  const ahead = points.filter((p) => p.time + 15 * 60_000 > now).slice(0, 24);

  if (nowMm >= WET_MM) {
    // Find the end of this spell: two dry steps in a row.
    let endsAt: number | null = null;
    for (let i = 0; i < ahead.length - 1; i += 1) {
      if (ahead[i].mm < WET_MM && ahead[i + 1].mm < WET_MM) {
        endsAt = ahead[i].time;
        break;
      }
    }
    const heaviest = ahead.reduce((max, p) => Math.max(max, p.mm), nowMm);
    return {
      kind: "raining",
      headline: "Raining where you are",
      detail: endsAt
        ? `${intensityWord(heaviest)} rain — looks like it eases around ${phClock(endsAt)}.`
        : `${intensityWord(heaviest)} rain, still going in 6 hours — worth an umbrella.`,
      startsAt: null,
      endsAt,
    };
  }

  const start = ahead.find((p) => p.mm >= WET_MM);
  if (start) {
    const minutes = roundToFive((start.time - now) / 60_000);
    const heaviest = ahead
      .filter((p) => p.time >= start.time && p.time <= start.time + 2 * 60 * 60_000)
      .reduce((max, p) => Math.max(max, p.mm), start.mm);
    const detail = `${intensityWord(heaviest)} rain, about ${Math.max(1, Math.round(mmPerHour(heaviest) * 10) / 10)} mm per hour.`;
    if (minutes <= 120) {
      return {
        kind: "soon",
        headline:
          minutes <= 20 ? "Rain is minutes away" : `Rain in about ${minutes} minutes`,
        detail,
        startsAt: start.time,
        endsAt: null,
      };
    }
    return {
      kind: "soon",
      headline: `Rain later, around ${phClock(start.time)}`,
      detail,
      startsAt: start.time,
      endsAt: null,
    };
  }

  const soon = ahead.slice(0, 4);
  const bestChance = soon.reduce((max, p) => Math.max(max, p.prob), 0);
  if (bestChance >= 55) {
    return {
      kind: "maybe",
      headline: "Dry for now, but rain is possible",
      detail: `${bestChance}% chance inside the next hour — the model has rain nearby, not overhead.`,
      startsAt: null,
      endsAt: null,
    };
  }

  return {
    kind: "dry",
    headline: "Dry for the next 6 hours",
    detail: `Nothing above ${WET_MM} mm in the model${bestChance > 0 ? `, ${bestChance}% chance at most` : ""}.`,
    startsAt: null,
    endsAt: null,
  };
}

export async function fetchRain(coords: Coords, signal?: AbortSignal): Promise<RainReport> {
  const res = await fetch(rainUrl(coords), {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Rain service returned ${res.status}`);
  const data = (await res.json()) as OpenMeteoResponse;
  if (!data.minutely_15?.time?.length) throw new Error("Rain service returned no intervals");
  return parseRain(data, coords);
}

/* ------------------------------------------------------------- place name */

const PLACE_KEY = "panahon:rain:place:v1";

interface PlaceCache {
  key: string;
  savedAt: number;
  label: string | null;
}

/** Two decimals ≈ 1.1 km: the forecast grid is coarser than that anyway. */
export function placeKey(coords: Coords): string {
  return `${coords.lat.toFixed(2)},${coords.lon.toFixed(2)}`;
}

export function readPlace(coords: Coords): string | null {
  try {
    const raw = window.localStorage.getItem(PLACE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlaceCache;
    if (parsed.key !== placeKey(coords)) return null;
    if (Date.now() - parsed.savedAt > 24 * 60 * 60 * 1000) return null;
    return parsed.label;
  } catch {
    return null;
  }
}

function writePlace(coords: Coords, label: string | null): void {
  try {
    window.localStorage.setItem(
      PLACE_KEY,
      JSON.stringify({ key: placeKey(coords), savedAt: Date.now(), label } satisfies PlaceCache),
    );
  } catch {
    // Cache is a nicety.
  }
}

/** "Cebu I.T. Park, Cebu City" — the landmark first, the city as the anchor. */
export function shortPlace(displayName: string, address: Record<string, string | undefined>): string {
  const parts = displayName
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const city = address.city ?? address.town ?? address.municipality ?? address.village ?? "";
  const drop = new Set(
    [address.country, address.state, address.region, address.postcode].filter(Boolean) as string[],
  );
  // parts[0] is usually a street; the useful landmark sits just after it.
  const middle = parts.slice(1).filter((part) => !drop.has(part) && part !== city);
  const landmark = middle.find((part) => !/^\d{4}$/.test(part));
  if (landmark && city) return `${landmark}, ${city}`;
  if (landmark) return landmark;
  if (city) return city;
  return parts.slice(0, 2).join(", ");
}

export async function fetchPlace(coords: Coords, signal?: AbortSignal): Promise<string | null> {
  const cached = readPlace(coords);
  if (cached) return cached;

  const params = new URLSearchParams({
    lat: coords.lat.toFixed(4),
    lon: coords.lon.toFixed(4),
    format: "jsonv2",
    addressdetails: "1",
    zoom: "16",
  });
  const res = await fetch(`${NOMINATIM}?${params.toString()}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Place lookup returned ${res.status}`);
  const data = (await res.json()) as { display_name?: string; address?: Record<string, string | undefined> };
  const label = data.display_name ? shortPlace(data.display_name, data.address ?? {}) : null;
  writePlace(coords, label);
  return label;
}

/* ---------------------------------------------------------------- storage */

const CACHE_KEY = "panahon:rain:v1";
const CALLS_KEY = "panahon:rain:calls:v1";

export interface RainCache {
  savedAt: number;
  key: string;
  report: RainReport;
}

export function readRainCache(coords: Coords): RainCache | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RainCache;
    if (!parsed.report || !parsed.savedAt) return null;
    if (parsed.key !== placeKey(coords)) return null;
    if (Date.now() - parsed.savedAt > CACHE_MAX_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeRainCache(coords: Coords, report: RainReport): void {
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), key: placeKey(coords), report } satisfies RainCache),
    );
  } catch {
    // Cache is a nicety.
  }
}

export function readRainCalls(): number {
  try {
    const raw = window.localStorage.getItem(CALLS_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { date: string; n: number };
    return parsed.date === new Date().toISOString().slice(0, 10) ? parsed.n : 0;
  } catch {
    return 0;
  }
}

export function noteRainCalls(n: number): void {
  try {
    window.localStorage.setItem(
      CALLS_KEY,
      JSON.stringify({ date: new Date().toISOString().slice(0, 10), n: readRainCalls() + n }),
    );
  } catch {
    // Ignore.
  }
}
