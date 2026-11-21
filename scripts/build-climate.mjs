// Fetches 1991–2020 monthly climate normals for every station and freezes them
// into lib/climate.json. Run with: node scripts/build-climate.mjs
import { readFile, writeFile } from "node:fs/promises";

const CITIES_SRC = new URL("../lib/cities.ts", import.meta.url);
const OUT = new URL("../lib/climate.json", import.meta.url);
const START = "1991-01-01";
const END = "2020-12-31";

const src = await readFile(CITIES_SRC, "utf8");
const cities = [...src.matchAll(/\{\s*id:\s*"([^"]+)"[^}]*?lat:\s*(-?[\d.]+),\s*lon:\s*(-?[\d.]+)/g)].map(
  (m) => ({ id: m[1], lat: Number(m[2]), lon: Number(m[3]) }),
);
if (!cities.length) throw new Error("no cities parsed from lib/cities.ts");

const url =
  `https://archive-api.open-meteo.com/v1/archive?latitude=${cities.map((c) => c.lat).join(",")}` +
  `&longitude=${cities.map((c) => c.lon).join(",")}` +
  `&start_date=${START}&end_date=${END}` +
  `&daily=precipitation_sum,temperature_2m_max&timezone=Asia%2FManila`;

console.log(`fetching ${cities.length} stations, ${START} → ${END}`);
const res = await fetch(url);
if (!res.ok) throw new Error(`archive API ${res.status} ${res.statusText}`);
const json = await res.json();
const places = Array.isArray(json) ? json : [json];
if (places.length !== cities.length) throw new Error(`expected ${cities.length} places, got ${places.length}`);

const out = {
  source: "Open-Meteo Archive API (ERA5), monthly normals",
  period: `${START.slice(0, 4)}-${END.slice(0, 4)}`,
  units: { rain: "mm/month", tmax: "degC" },
  cities: {},
};

places.forEach((place, idx) => {
  const { time, precipitation_sum: rain, temperature_2m_max: tmax } = place.daily;
  const rainSum = Array(12).fill(0);
  const rainCount = Array(12).fill(0);
  const tmaxSum = Array(12).fill(0);
  const tmaxCount = Array(12).fill(0);

  for (let i = 0; i < time.length; i++) {
    const m = Number(time[i].slice(5, 7)) - 1;
    if (typeof rain[i] === "number") {
      rainSum[m] += rain[i];
      rainCount[m] += 1;
    }
    if (typeof tmax[i] === "number") {
      tmaxSum[m] += tmax[i];
      tmaxCount[m] += 1;
    }
  }

  const years = Number(END.slice(0, 4)) - Number(START.slice(0, 4)) + 1;
  out.cities[cities[idx].id] = {
    rain: rainSum.map((v, i) => Math.round((v / years) * 10) / 10),
    tmax: tmaxSum.map((v, i) => Math.round((v / tmaxCount[i]) * 100) / 100),
    samples: rainCount[0],
  };
});

await writeFile(OUT, JSON.stringify(out), "utf8");
console.log(`wrote ${Object.keys(out.cities).length} stations to lib/climate.json`);
console.log("manila rain by month:", out.cities.manila?.rain.join(", "));
