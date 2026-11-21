import { CITIES, type City } from "./cities";
import type { HistoryDay } from "./climate";

export type { HistoryDay };

const API = "https://api.open-meteo.com/v1/forecast";

const CURRENT_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "weather_code",
  "wind_speed_10m",
  "is_day",
  "precipitation",
].join(",");

const DAILY_FIELDS = [
  "weather_code",
  "precipitation_sum",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_probability_max",
  "sunrise",
  "sunset",
  "uv_index_max",
].join(",");

export interface DayForecast {
  date: string;
  code: number;
  max: number;
  min: number;
  rainChance: number | null;
  /** Total rain expected or recorded, mm. */
  rainSum: number;
  sunrise: string | null;
  sunset: string | null;
  uvMax: number | null;
}

export interface CitySnapshot {
  city: City;
  /** Local time of the observation, Asia/Manila. */
  observedAt: string;
  temp: number;
  feelsLike: number;
  humidity: number;
  wind: number;
  code: number;
  isDay: boolean;
  rainNow: number;
  /** Today onward — index 0 is today. */
  days: DayForecast[];
}

interface RawPlace {
  latitude: number;
  longitude: number;
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    is_day: number;
    precipitation: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max: (number | null)[];
    sunrise: string[];
    sunset: string[];
    uv_index_max: (number | null)[];
  };
}

function toSnapshot(place: RawPlace, city: City): CitySnapshot {
  const d = place.daily;

  const day = (i: number): DayForecast => ({
    date: d.time[i],
    code: d.weather_code[i],
    max: d.temperature_2m_max[i],
    min: d.temperature_2m_min[i],
    rainChance: d.precipitation_probability_max?.[i] ?? null,
    rainSum: d.precipitation_sum?.[i] ?? 0,
    sunrise: d.sunrise?.[i] ?? null,
    sunset: d.sunset?.[i] ?? null,
    uvMax: d.uv_index_max?.[i] ?? null,
  });

  return {
    city,
    observedAt: place.current.time,
    temp: place.current.temperature_2m,
    feelsLike: place.current.apparent_temperature,
    humidity: place.current.relative_humidity_2m,
    wind: place.current.wind_speed_10m,
    code: place.current.weather_code,
    isDay: place.current.is_day === 1,
    rainNow: place.current.precipitation,
    days: d.time.map((_, i) => day(i)),
  };
}

/** 92 days of observed rainfall and daily highs, for the climate comparison. */
export async function fetchHistory(city: City, signal?: AbortSignal): Promise<HistoryDay[]> {
  const url =
    `${API}?latitude=${city.lat}&longitude=${city.lon}` +
    `&daily=precipitation_sum,temperature_2m_max&timezone=Asia%2FManila&past_days=92&forecast_days=1`;
  const res = await fetch(url, { signal });
  if (res.status === 429) throw new Error("rate limited");
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const json = await res.json();
  const d = json.daily;
  const today = d.time[d.time.length - 1];
  return (d.time as string[])
    .map((date, i) => ({
      date,
      rain: d.precipitation_sum?.[i] ?? null,
      tmax: d.temperature_2m_max?.[i] ?? null,
    }))
    .filter((h) => h.date < today);
}

/** One request for every station: Open-Meteo accepts comma-separated coordinates. */
export async function fetchAllCities(signal?: AbortSignal): Promise<CitySnapshot[]> {
  const lat = CITIES.map((c) => c.lat).join(",");
  const lon = CITIES.map((c) => c.lon).join(",");
  const url =
    `${API}?latitude=${lat}&longitude=${lon}` +
    `&current=${CURRENT_FIELDS}&daily=${DAILY_FIELDS}` +
    `&timezone=Asia%2FManila&forecast_days=6`;

  const res = await fetch(url, { signal });
  if (res.status === 429) {
    throw new Error("Open-Meteo is rate-limiting this tab — wait about a minute, then hit Refresh");
  }
  if (!res.ok) throw new Error(`Open-Meteo ${res.status} ${res.statusText}`);
  const json = await res.json();
  const places: RawPlace[] = Array.isArray(json) ? json : [json];
  return places.map((p, i) => toSnapshot(p, CITIES[i]));
}

/** What a background poll needs: the numbers on screen right now, nothing more. */
export type CurrentOnly = Pick<
  CitySnapshot,
  "observedAt" | "temp" | "feelsLike" | "humidity" | "wind" | "code" | "isDay" | "rainNow"
>;

/**
 * Light refresh: current values for every station, no daily or hourly payload.
 * The 2-minute poll uses this; the six-day forecast only comes back on a full load.
 */
export async function fetchCurrentOnly(signal?: AbortSignal): Promise<Map<string, CurrentOnly>> {
  const lat = CITIES.map((c) => c.lat).join(",");
  const lon = CITIES.map((c) => c.lon).join(",");
  const url =
    `${API}?latitude=${lat}&longitude=${lon}` + `&current=${CURRENT_FIELDS}&timezone=Asia%2FManila`;

  const res = await fetch(url, { signal });
  if (res.status === 429) {
    throw new Error("Open-Meteo is rate-limiting this tab — wait about a minute, then hit Refresh");
  }
  if (!res.ok) throw new Error(`Open-Meteo ${res.status} ${res.statusText}`);

  const json = await res.json();
  const places: RawPlace[] = Array.isArray(json) ? json : [json];
  return new Map(
    places.map((p, i) => [
      CITIES[i].id,
      {
        observedAt: p.current.time,
        temp: p.current.temperature_2m,
        feelsLike: p.current.apparent_temperature,
        humidity: p.current.relative_humidity_2m,
        wind: p.current.wind_speed_10m,
        code: p.current.weather_code,
        isDay: p.current.is_day === 1,
        rainNow: p.current.precipitation,
      },
    ]),
  );
}

export interface HourlyPoint {
  time: string;
  temp: number;
  rain: number;
  code: number;
}

export async function fetchHourly(city: City, signal?: AbortSignal): Promise<HourlyPoint[]> {
  const url =
    `${API}?latitude=${city.lat}&longitude=${city.lon}` +
    `&hourly=temperature_2m,precipitation_probability,weather_code&timezone=Asia%2FManila&forecast_days=2`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const json = await res.json();
  const h = json.hourly;
  return (h.time as string[]).map((time, i) => ({
    time,
    temp: h.temperature_2m[i],
    rain: h.precipitation_probability?.[i] ?? 0,
    code: h.weather_code[i],
  }));
}

export type Condition =
  | "clear"
  | "mostly-clear"
  | "cloudy"
  | "overcast"
  | "fog"
  | "drizzle"
  | "rain"
  | "downpour"
  | "thunder";

export const CONDITIONS: Condition[] = [
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

/**
 * Words a person actually types into the address bar, mapped to a backdrop.
 * `windy` is not a weather code: it draws a layer over whatever the sky is,
 * which is why it travels as its own preview value.
 */
const PREVIEW_WORDS: Record<string, Condition | "windy"> = {
  clear: "clear",
  sunny: "clear",
  sun: "clear",
  "mostly-clear": "mostly-clear",
  "partly-cloudy": "mostly-clear",
  cloudy: "cloudy",
  clouds: "cloudy",
  overcast: "overcast",
  fog: "fog",
  foggy: "fog",
  drizzle: "drizzle",
  rain: "rain",
  rainy: "rain",
  downpour: "downpour",
  storm: "downpour",
  thunder: "thunder",
  thunderstorm: "thunder",
  lightning: "thunder",
  windy: "windy",
};

/** Resolve `?wx=` or a bare path such as `/thunder` (from a 404) to a preview. */
export function previewFor(value: string | null | undefined): Condition | "windy" | null {
  if (!value) return null;
  const key = value.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  return PREVIEW_WORDS[key] ?? null;
}

export interface ConditionMeta {
  condition: Condition;
  label: string;
}

const WMO: Record<number, ConditionMeta> = {
  0: { condition: "clear", label: "Clear sky" },
  1: { condition: "mostly-clear", label: "Mainly clear" },
  2: { condition: "cloudy", label: "Partly cloudy" },
  3: { condition: "overcast", label: "Overcast" },
  45: { condition: "fog", label: "Fog" },
  48: { condition: "fog", label: "Rime fog" },
  51: { condition: "drizzle", label: "Light drizzle" },
  53: { condition: "drizzle", label: "Drizzle" },
  55: { condition: "drizzle", label: "Heavy drizzle" },
  56: { condition: "drizzle", label: "Freezing drizzle" },
  57: { condition: "drizzle", label: "Freezing drizzle" },
  61: { condition: "rain", label: "Light rain" },
  63: { condition: "rain", label: "Rain" },
  65: { condition: "downpour", label: "Heavy rain" },
  66: { condition: "rain", label: "Freezing rain" },
  67: { condition: "downpour", label: "Freezing rain" },
  71: { condition: "rain", label: "Light snow" },
  73: { condition: "rain", label: "Snow" },
  75: { condition: "downpour", label: "Heavy snow" },
  77: { condition: "rain", label: "Snow grains" },
  80: { condition: "rain", label: "Light showers" },
  81: { condition: "rain", label: "Showers" },
  82: { condition: "downpour", label: "Violent showers" },
  85: { condition: "rain", label: "Snow showers" },
  86: { condition: "downpour", label: "Snow showers" },
  95: { condition: "thunder", label: "Thunderstorm" },
  96: { condition: "thunder", label: "Storm with hail" },
  99: { condition: "thunder", label: "Severe storm, hail" },
};

export function describe(code: number): ConditionMeta {
  return WMO[code] ?? { condition: "cloudy", label: "Unknown" };
}

export function celsius(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(digits)}°`;
}

export function dayName(iso: string, index: number): string {
  if (index === 0) return "Today";
  const d = new Date(`${iso}T00:00:00+08:00`);
  return d.toLocaleDateString("en-PH", { weekday: "short", timeZone: "Asia/Manila" });
}

export function dayDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00+08:00`);
  return d.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

export function clockTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  });
}

/** Grouped condition, for the "how today breaks down" summary. */
export type ConditionGroup = "sun" | "cloud" | "rain" | "storm";

export function conditionGroup(code: number): ConditionGroup {
  if (code >= 95) return "storm";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 86)) return "rain";
  if (code === 3 || code === 45 || code === 48) return "cloud";
  return "sun";
}

/** One word a person would actually use, for the daily cards. */
export function shortLabel(code: number): string {
  if (code >= 95) return "Storm";
  if (code === 65 || code === 82) return "Heavy rain";
  if (code >= 80) return "Showers";
  if (code >= 61) return "Rain";
  if (code >= 51) return "Drizzle";
  if (code === 45 || code === 48) return "Fog";
  if (code === 3) return "Cloudy";
  if (code === 2) return "Partly cloudy";
  if (code === 1) return "Mostly sunny";
  return "Sunny";
}

export interface DayShare {
  group: ConditionGroup;
  label: string;
  pct: number;
}

/**
 * Share of the remaining hours in each condition group, rounded so the four
 * numbers add up to exactly 100.
 */
export function shareOfHours(points: HourlyPoint[]): DayShare[] {
  const raw: Record<ConditionGroup, number> = { sun: 0, cloud: 0, rain: 0, storm: 0 };
  for (const p of points) raw[conditionGroup(p.code)] += 1;

  const total = points.length || 1;
  const labels: Record<ConditionGroup, string> = {
    sun: "Sunny",
    cloud: "Cloudy",
    rain: "Rain",
    storm: "Thunder",
  };
  const order: ConditionGroup[] = ["sun", "cloud", "rain", "storm"];

  const exact = order.map((g) => (raw[g] / total) * 100);
  const floored = exact.map((v) => Math.floor(v));
  let remainder = 100 - floored.reduce((a, b) => a + b, 0);
  const byFraction = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of byFraction) {
    if (remainder <= 0) break;
    floored[i] += 1;
    remainder -= 1;
  }

  return order
    .map((g, i) => ({ group: g, label: labels[g], pct: floored[i] }))
    .filter((s) => s.pct > 0);
}
