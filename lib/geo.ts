import { CITIES, DEFAULT_CITY_ID, type City } from "./cities";

/**
 * Where the visitor is, resolved to the nearest station we have data for.
 * Everything here runs in the browser: the page is a static export, so there is
 * no server to do the lookup. Two ways in, cheapest first —
 *   1. the browser's own geolocation (silent when permission was already given,
 *      or triggered by a deliberate tap on "Use my exact location"), and
 *   2. an IP lookup, which needs no permission but is coarse and wrong behind a VPN.
 */

const EARTH_RADIUS_KM = 6371;

/** Beyond this, the numbers at the nearest station are not "here" numbers any more. */
const MAX_USEFUL_KM = 400;

export interface Coords {
  lat: number;
  lon: number;
}

export type LocationSource = "gps" | "ip";

export interface VisitorLocation {
  /** Station to open on: the nearest one, or the default when the visitor is out of range. */
  cityId: string;
  cityName: string;
  source: LocationSource;
  /** Distance from the visitor to the nearest station, rounded to whole km. */
  km: number;
  /** True when every station is further than MAX_USEFUL_KM away (usually: outside the PH). */
  outside: boolean;
  /** The position itself, so panels can ask for that exact point rather than a station. */
  coords: Coords;
}

export function distanceKm(a: Coords, b: Coords): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function nearestCity(at: Coords): { city: City; km: number } {
  let best = CITIES[0];
  let bestKm = distanceKm(at, best);
  for (const city of CITIES.slice(1)) {
    const km = distanceKm(at, city);
    if (km < bestKm) {
      best = city;
      bestKm = km;
    }
  }
  return { city: best, km: bestKm };
}

function fromCoords(at: Coords, source: LocationSource): VisitorLocation {
  const { city, km } = nearestCity(at);
  const outside = km > MAX_USEFUL_KM;
  const chosen = outside ? CITIES.find((c) => c.id === DEFAULT_CITY_ID) ?? city : city;
  return {
    cityId: chosen.id,
    cityName: chosen.name,
    source,
    km: Math.round(km),
    outside,
    coords: at,
  };
}

interface BrowserCoords extends Coords {
  accuracy?: number;
}

function browserCoords(timeoutMs: number): Promise<BrowserCoords | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const done = (value: BrowserCoords | null) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    // A slow lookup should not hold the page: resolve null and let the IP path run.
    const timer = setTimeout(() => done(null), timeoutMs + 250);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        done({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => {
        clearTimeout(timer);
        done(null);
      },
      { timeout: timeoutMs, maximumAge: 10 * 60 * 1000, enableHighAccuracy: false },
    );
  });
}

/** Only when the browser already trusts this site — never a dialog on page load. */
async function permissionGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions?.query({
      name: "geolocation" as PermissionName,
    });
    return status?.state === "granted";
  } catch {
    return false;
  }
}

async function getJson<T>(url: string, timeoutMs: number): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Free, key-less, CORS-friendly IP lookups. Tried in parallel and the first
 * usable answer wins; any single one being down or rate-limited is not fatal.
 */
const IP_LOOKUPS: { url: string; read: (data: Record<string, unknown>) => Coords | null }[] = [
  {
    url: "https://ipwho.is/",
    read: (d) => {
      if (d.success === false) return null;
      const lat = Number(d.latitude);
      const lon = Number(d.longitude);
      return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
    },
  },
  {
    url: "https://ipapi.co/json/",
    read: (d) => {
      const lat = Number(d.latitude);
      const lon = Number(d.longitude);
      return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
    },
  },
  {
    url: "https://ipinfo.io/json",
    read: (d) => {
      const loc = typeof d.loc === "string" ? d.loc.split(",") : [];
      const lat = Number(loc[0]);
      const lon = Number(loc[1]);
      return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
    },
  },
];

function ipCoords(timeoutMs: number): Promise<Coords | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: Coords | null) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const timer = setTimeout(() => done(null), timeoutMs + 250);
    for (const lookup of IP_LOOKUPS) {
      void getJson<Record<string, unknown>>(lookup.url, timeoutMs).then((data) => {
        if (!data) return;
        const coords = lookup.read(data);
        if (coords) {
          clearTimeout(timer);
          done(coords);
        }
      });
    }
  });
}

/**
 * Resolve the visitor to a station without ever showing a permission dialog.
 * Resolves null when nothing worked — the caller keeps its own default.
 */
export async function detectVisitorLocation(): Promise<VisitorLocation | null> {
  if (await permissionGranted()) {
    const gps = await browserCoords(2500);
    if (gps) return fromCoords(gps, "gps");
  }
  const ip = await ipCoords(2500);
  if (ip) return fromCoords(ip, "ip");
  return null;
}

/** Called from a button: the permission dialog is expected, and welcome. */
export async function requestExactLocation(): Promise<VisitorLocation | null> {
  const gps = await browserCoords(12_000);
  return gps ? fromCoords(gps, "gps") : null;
}

/**
 * `?at=lat,lon` forces a position, for testing and for showing someone what the
 * page looks like from another island. Returns null when the param is absent or junk.
 */
export function locationFromParam(search: string): VisitorLocation | null {
  const raw = new URLSearchParams(search).get("at");
  if (!raw) return null;
  const [lat, lon] = raw.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return fromCoords({ lat, lon }, "ip");
}
