// Prints each station's current condition, so a rainy one can be picked in the UI.
import { readFile } from "node:fs/promises";

const src = await readFile(new URL("../lib/cities.ts", import.meta.url), "utf8");
const cities = [...src.matchAll(/\{\s*id:\s*"([^"]+)"[^}]*?name:\s*"([^"]+)"[^}]*?lat:\s*(-?[\d.]+),\s*lon:\s*(-?[\d.]+)/g)].map(
  (m) => ({ id: m[1], name: m[2], lat: Number(m[3]), lon: Number(m[4]) }),
);

const url =
  `https://api.open-meteo.com/v1/forecast?latitude=${cities.map((c) => c.lat).join(",")}` +
  `&longitude=${cities.map((c) => c.lon).join(",")}` +
  `&current=weather_code,temperature_2m&timezone=Asia%2FManila`;

const res = await fetch(url);
if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
const json = await res.json();
const places = Array.isArray(json) ? json : [json];

const LABEL = {
  0: "clear", 1: "mostly-clear", 2: "cloudy", 3: "overcast", 45: "fog", 48: "fog",
  51: "drizzle", 53: "drizzle", 55: "drizzle", 56: "drizzle", 57: "drizzle",
  61: "rain", 63: "rain", 65: "downpour", 66: "rain", 67: "downpour",
  80: "rain", 81: "rain", 82: "downpour", 95: "thunder", 96: "thunder", 99: "thunder",
};

const rows = places.map((p, i) => ({
  city: cities[i].name,
  code: p.current.weather_code,
  condition: LABEL[p.current.weather_code] ?? "unknown",
  temp: p.current.temperature_2m,
}));

const groups = {};
for (const r of rows) (groups[r.condition] ??= []).push(`${r.city} ${r.temp}°`);

for (const [cond, list] of Object.entries(groups)) {
  console.log(`${cond.padEnd(13)} ${list.join(", ")}`);
}
