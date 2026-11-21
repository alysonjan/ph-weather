/**
 * Freeze a simplified Philippines coastline into lib/ph-outline.json.
 *
 * One-off-ish: the source is Natural Earth 1:50m country polygons. We keep only
 * the rings big enough to read at the map's size, simplify them, and round the
 * coordinates, because the SVG re-projects them on every render and 3 MB of
 * GeoJSON in the bundle would be absurd.
 *
 * Run: node scripts/build-outline.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";

/** Degrees. 0.02° is roughly 2 km — fine for a 900 px tall map. */
const TOLERANCE = 0.02;
/** Rings smaller than this (in degrees of bbox diagonal) are specks at this scale. */
const MIN_RING_SPAN = 0.12;

const here = dirname(fileURLToPath(import.meta.url));

function perpDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + clamped * dx), p[1] - (a[1] + clamped * dy));
}

/** Douglas–Peucker, iterative so a long coastline can't blow the stack. */
function simplify(points, tolerance) {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let index = -1;
    let max = 0;
    for (let i = first + 1; i < last; i += 1) {
      const d = perpDistance(points[i], points[first], points[last]);
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (index !== -1 && max > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function span(ring) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return Math.hypot(maxLon - minLon, maxLat - minLat);
}

function round(points) {
  return points.map(([lon, lat]) => [Number(lon.toFixed(3)), Number(lat.toFixed(3))]);
}

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`Natural Earth download failed: ${res.status}`);
const geo = await res.json();

const country = geo.features.find(
  (f) => f.properties?.ADMIN === "Philippines" || f.properties?.ISO_A3 === "PHL",
);
if (!country) throw new Error("Philippines feature not found in the Natural Earth file");

const polygons =
  country.geometry.type === "Polygon"
    ? [country.geometry.coordinates]
    : country.geometry.coordinates;

const rings = [];
for (const polygon of polygons) {
  for (const ring of polygon) {
    if (span(ring) < MIN_RING_SPAN) continue;
    const simplified = round(simplify(ring, TOLERANCE));
    if (simplified.length >= 4) rings.push(simplified);
  }
}

// Biggest islands first: the browser draws in order and tiny islets should sit on top.
rings.sort((a, b) => span(b) - span(a));

let minLon = Infinity;
let maxLon = -Infinity;
let minLat = Infinity;
let maxLat = -Infinity;
for (const ring of rings) {
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
}

const out = {
  source: "Natural Earth 1:50m admin-0 countries (public domain)",
  tolerance: TOLERANCE,
  bbox: {
    minLon: Number(minLon.toFixed(2)),
    maxLon: Number(maxLon.toFixed(2)),
    minLat: Number(minLat.toFixed(2)),
    maxLat: Number(maxLat.toFixed(2)),
  },
  rings,
};

mkdirSync(join(here, "..", "lib"), { recursive: true });
const target = join(here, "..", "lib", "ph-outline.json");
writeFileSync(target, `${JSON.stringify(out)}\n`);
console.log(
  `wrote ${target}: ${rings.length} rings, ${rings.reduce((n, r) => n + r.length, 0)} points, ` +
    `bbox ${out.bbox.minLon}..${out.bbox.maxLon} / ${out.bbox.minLat}..${out.bbox.maxLat}`,
);
