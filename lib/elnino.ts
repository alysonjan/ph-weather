import raw from "./oni.json";

/**
 * Oceanic Niño Index — 3-month running mean SST anomaly over Niño 3.4.
 * Sourced from NOAA CPC (oni.ascii.txt) and frozen at build time, because a
 * static export can't call NOAA's plain-text endpoint from the browser.
 */
export const ONI_SOURCE = raw.source;
const SEASONS = raw.seasons as string[];
const YEARS = raw.years as number[];
const VALUES = raw.values as number[];

export interface OniPoint {
  season: string;
  year: number;
  value: number;
  /** Continuous 0-based index, so charts get even spacing across years. */
  i: number;
}

export const SERIES: OniPoint[] = VALUES.map((value, i) => ({
  season: SEASONS[i],
  year: YEARS[i],
  value,
  i,
}));

/** The informal "super El Niño" bar: a 3-month mean anomaly at or above +2.0 °C. */
export const SUPER_THRESHOLD = 2.0;
/** NOAA's own "very strong" tier. */
export const VERY_STRONG_THRESHOLD = 1.5;
/** El Niño conditions begin here. */
export const EL_NINO_THRESHOLD = 0.5;

export interface OniEvent {
  start: OniPoint;
  end: OniPoint;
  peak: OniPoint;
  lengthSeasons: number;
  superEvent: boolean;
}

function buildEvents(): OniEvent[] {
  const events: OniEvent[] = [];
  let run: OniPoint[] = [];
  for (const p of SERIES) {
    if (p.value >= EL_NINO_THRESHOLD) {
      run.push(p);
    } else if (run.length >= 3) {
      events.push(toEvent(run));
      run = [];
    } else {
      run = [];
    }
  }
  if (run.length >= 3) events.push(toEvent(run));
  return events;
}

function toEvent(run: OniPoint[]): OniEvent {
  const peak = run.reduce((a, b) => (b.value > a.value ? b : a));
  return {
    start: run[0],
    end: run[run.length - 1],
    peak,
    lengthSeasons: run.length,
    superEvent: peak.value >= SUPER_THRESHOLD,
  };
}

export const EVENTS = buildEvents();

const latest = SERIES[SERIES.length - 1];
const previous = SERIES[SERIES.length - 2];

export interface SuperElNino {
  current: OniPoint;
  previous: OniPoint;
  changeSinceLastSeason: number;
  threshold: number;
  /** Positive = how far past the threshold; negative = how far short of it. */
  marginToSuper: number;
  isSuper: boolean;
  seasonsAtSuper: number;
  peakThisEvent: OniPoint;
  rank: number;
  totalEvents: number;
  runnerUp: OniEvent | null;
  onsetRampPerSeason: number;
  onsetSeasons: number;
  fastestOnset: { value: number; event: OniEvent } | null;
  superEvents: OniEvent[];
  chart: OniPoint[];
}

function currentEvent(): OniEvent {
  // Walk back from the newest point while conditions stay in El Niño territory.
  let start = SERIES.length - 1;
  while (start > 0 && SERIES[start - 1].value >= EL_NINO_THRESHOLD) start--;
  const run = SERIES.slice(start);
  return toEvent(run.length ? run : [latest]);
}

function compute(): SuperElNino {
  const event = currentEvent();
  const rankAmongPeaks = [...EVENTS]
    .sort((a, b) => b.peak.value - a.peak.value)
    .findIndex((e) => e.start.i === event.start.i && e.end.i === event.end.i);
  const ranked = [...EVENTS].sort((a, b) => b.peak.value - a.peak.value);

  const onsetSeasons = event.end.i - event.start.i + 1;
  const onsetRampPerSeason =
    onsetSeasons > 1 ? (latest.value - event.start.value) / (onsetSeasons - 1) : 0;

  const onsets = EVENTS.map((e) => {
    const len = e.end.i - e.start.i + 1;
    return {
      value: len > 1 ? (e.peak.value - e.start.value) / (len - 1) : 0,
      event: e,
    };
  }).sort((a, b) => b.value - a.value);

  const atSuper = SERIES.filter((p, i) => i >= event.start.i && p.value >= SUPER_THRESHOLD);

  return {
    current: latest,
    previous,
    changeSinceLastSeason: Number((latest.value - previous.value).toFixed(2)),
    threshold: SUPER_THRESHOLD,
    marginToSuper: Number((latest.value - SUPER_THRESHOLD).toFixed(2)),
    isSuper: latest.value >= SUPER_THRESHOLD,
    seasonsAtSuper: atSuper.length,
    peakThisEvent: event.peak,
    rank: rankAmongPeaks >= 0 ? rankAmongPeaks + 1 : 0,
    totalEvents: EVENTS.length,
    runnerUp: ranked[1] ?? null,
    onsetRampPerSeason: Number(onsetRampPerSeason.toFixed(2)),
    onsetSeasons,
    fastestOnset: onsets[0] ?? null,
    superEvents: EVENTS.filter((e) => e.superEvent).sort((a, b) => a.peak.i - b.peak.i),
    chart: SERIES.slice(-360),
  };
}

export const SUPER_EL_NINO: SuperElNino = compute();

/** Distance from the current value to the super threshold, as a % of the gauge. */
export function gaugePercent(value: number, min = -1, max = 3): number {
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

/** ONI seasons are three-month blocks; spell them out so nobody has to decode ASO. */
export const SEASON_MONTHS: Record<string, string> = {
  DJF: "Dec–Feb",
  JFM: "Jan–Mar",
  FMA: "Feb–Apr",
  MAM: "Mar–May",
  AMJ: "Apr–Jun",
  MJJ: "May–Jul",
  JJA: "Jun–Aug",
  JAS: "Jul–Sep",
  ASO: "Aug–Oct",
  SON: "Sep–Nov",
  OND: "Oct–Dec",
  NDJ: "Nov–Jan",
};

export function seasonLabel(season: string): string {
  return SEASON_MONTHS[season] ?? season;
}
