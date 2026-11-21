import raw from "./climate.json";
import { CITIES } from "./cities";

/**
 * How the last 90 days of rain compare with the 1991–2020 normal for the same
 * window. This is a local drought signal computed from Open-Meteo data — useful
 * and explainable, but it is NOT a PAGASA drought declaration.
 */
export const CLIMATE_PERIOD = raw.period;
export const CLIMATE_SOURCE = raw.source;

interface Normals {
  rain: number[];
  tmax: number[];
}

const NORMALS = raw.cities as Record<string, Normals>;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function monthIndex(isoDate: string): number {
  return Number(isoDate.slice(5, 7)) - 1;
}

/** Normal for a set of calendar days, pro-rated from the monthly 1991–2020 totals. */
function normalSum(cityId: string, dates: string[], pick: (n: Normals) => number[]): number {
  const normals = NORMALS[cityId];
  if (!normals) return 0;
  const series = pick(normals);
  return dates.reduce((sum, d) => {
    const m = monthIndex(d);
    return sum + series[m] / DAYS_IN_MONTH[m];
  }, 0);
}

/** Average of a daily-mean series (temperature) over the window. */
function normalMean(cityId: string, dates: string[], pick: (n: Normals) => number[]): number {
  const normals = NORMALS[cityId];
  if (!normals || !dates.length) return 0;
  const series = pick(normals);
  const total = dates.reduce((sum, d) => sum + series[monthIndex(d)], 0);
  return total / dates.length;
}

export type ClimateTone = "rose" | "amber" | "emerald" | "sky";

export interface ClimateStatus {
  key: "drought" | "dry" | "normal" | "wet";
  label: string;
  tone: ClimateTone;
  meaning: string;
}

export interface LocalClimate {
  cityName: string;
  rain30: number;
  normal30: number;
  pct30: number;
  rain90: number;
  normal90: number;
  pct90: number;
  tmax30: number;
  normalTmax30: number;
  tmaxDelta: number;
  status: ClimateStatus;
}

export interface HistoryDay {
  date: string;
  rain: number | null;
  tmax: number | null;
}

function statusFor(pct90: number): ClimateStatus {
  if (pct90 < 40) {
    return {
      key: "drought",
      label: "Drought-like",
      tone: "rose",
      meaning:
        "Rain over the last three months is far below normal. Creeks, farm water and reservoirs are usually stressed at this level.",
    };
  }
  if (pct90 < 80) {
    return {
      key: "dry",
      label: "Dry spell",
      tone: "amber",
      meaning:
        "Rain has been running below normal. If the next month stays this dry, this becomes a drought.",
    };
  }
  if (pct90 <= 120) {
    return {
      key: "normal",
      label: "Near normal",
      tone: "emerald",
      meaning: "Rainfall is close to what this time of year usually brings.",
    };
  }
  return {
    key: "wet",
    label: "Wetter than normal",
    tone: "sky",
    meaning: "Rain has been coming in above the long-term average for this window.",
  };
}

export function localClimate(cityId: string, history: HistoryDay[]): LocalClimate | null {
  if (!NORMALS[cityId] || history.length < 30) return null;

  const rainDays = history.filter((h) => typeof h.rain === "number");
  const last90 = rainDays.slice(-90);
  const last30 = rainDays.slice(-30);
  if (last30.length < 30) return null;

  const rain90 = last90.reduce((a, b) => a + (b.rain ?? 0), 0);
  const rain30 = last30.reduce((a, b) => a + (b.rain ?? 0), 0);
  const normal90 = normalSum(cityId, last90.map((d) => d.date), (n) => n.rain);
  const normal30 = normalSum(cityId, last30.map((d) => d.date), (n) => n.rain);

  const tmaxDays = history.filter((h) => typeof h.tmax === "number").slice(-30);
  const tmax30 = tmaxDays.reduce((a, b) => a + (b.tmax ?? 0), 0) / (tmaxDays.length || 1);
  const normalTmax30 = normalMean(cityId, tmaxDays.map((d) => d.date), (n) => n.tmax);

  const pct90 = normal90 > 0 ? (rain90 / normal90) * 100 : 100;
  const pct30 = normal30 > 0 ? (rain30 / normal30) * 100 : 100;

  const tmax30Rounded = Math.round(tmax30 * 10) / 10;
  const normalTmaxRounded = Math.round(normalTmax30 * 10) / 10;

  return {
    cityName: CITIES.find((c) => c.id === cityId)?.name ?? cityId,
    rain30: Math.round(rain30),
    normal30: Math.round(normal30),
    pct30: Math.round(pct30),
    rain90: Math.round(rain90),
    normal90: Math.round(normal90),
    pct90: Math.round(pct90),
    tmax30: tmax30Rounded,
    normalTmax30: normalTmaxRounded,
    tmaxDelta: Math.round((tmax30Rounded - normalTmaxRounded) * 10) / 10,
    status: statusFor(pct90),
  };
}
