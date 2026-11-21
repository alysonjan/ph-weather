# Panahon — Philippine weather and earthquakes, one site

A statically exported Next.js site with two tabs. The **Weather** tab answers three questions at once:

1. **Where is it hottest and coldest right now?** Top five stations by live air temperature, out of 28
   stations spread from Basco (Batanes) to General Santos.
2. **What are the next five days like?** A plain-language "today at a glance" (will it rain, how likely,
   how many mm, and how today's remaining hours break down by condition), then five daily cards, a
   24-hour temperature ribbon, sun times, and UV.
3. **How close is Metro Cebu to a super El Niño — and is it dry here?** NOAA's Oceanic Niño Index, put
   in plain terms next to what it is actually doing to the station you are looking at: last 90 days of
   rain against the 1991–2020 normal, and last 30 days of afternoon highs against the same normal.

The **Earthquakes** tab (`/earthquakes/`) shows every Philippine quake in the EMSC catalogue at M2.5
and up: a heat map of where they cluster, a plain-language reading of the selected event, and the most
recent ones. See [Earthquakes](#earthquakes) below.

## Stack

- Next.js 16 (App Router, Turbopack) with `output: "export"` — the build emits plain static files.
- React 19, TypeScript, Tailwind CSS v4 (CSS-first config in `app/globals.css`).
- No backend, no API key. Weather is fetched directly from [Open-Meteo](https://open-meteo.com) in the
  browser (all 28 stations in a single multi-coordinate request, plus one small history request for the
  home city).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # writes ./out
npm start          # serves ./out on http://localhost:4173
```

Deploy by uploading `out/` to any static host (Netlify, Vercel, S3, GitHub Pages, nginx).

## How fresh is it?

| Data | Freshness |
| --- | --- |
| Current conditions + forecasts | Full payload (current + six-day daily) on load and on Refresh. The **2-minute poll fetches current values only** — the daily forecast changes a few times a day, so re-sending it every two minutes is pure waste. Pausable via the timer pill; the timer stops while the tab is hidden. |
| Open-Meteo `current` itself | A 15-minute field (`interval: 900`), so new numbers appear at most every 15 min — the 2-minute poll is what keeps the page from drifting, not a promise of per-minute weather. |
| Oceanic Niño Index | Published monthly by NOAA, frozen into `lib/oni.json` at build. It does not change while a tab is open. |
| 1991–2020 normals | Frozen into `lib/climate.json` at build. |

If a refresh is refused (rate limit, offline), the page falls back to the **last good payload cached in
localStorage** for up to 12 hours and says so in an amber banner with the timestamp; it only shows the
error card when there is no usable cache.

Nothing is real-time in the websocket sense: this is a static page polling a public API. A failed
background refresh keeps the last good numbers on screen and lets the next cycle retry; only a failed
*first* load shows the error card with a retry button.

## The background reacts to the weather

The backdrop follows the station you are looking at (`components/WeatherBackdrop.tsx`), so tapping a
chip changes the sky:

| Condition | Backdrop |
| --- | --- |
| clear (day) | sun glow, slow rotating rays, 18 drifting light motes |
| clear (night) | moon glow |
| mostly clear | sun glow + 1 cloud near, 1 far |
| partly cloudy | 4 cloud silhouettes drifting + 2 slower, blurrier ones far behind |
| overcast | 6 + 4 clouds and a grey veil, no sun |
| fog | 3 haze bands |
| drizzle | 44 falling streaks + 3 clouds |
| rain | 82 streaks + 3 clouds |
| downpour | 132 streaks + 4 clouds + a dark storm wash |
| thunderstorm | 104 streaks + 5 clouds + storm wash + double flash every 11 s |
| windy | 12 tumbling leaves, 4 gust streaks and a kite crossing the sky |

Wind isn't a WMO code, so it is a **layer**, not a condition: it draws on top of whatever the sky is
doing. It switches on by itself when the selected station's wind reaches 35 km/h, and `?wx=windy`
forces it against a mostly-clear sky.

Two query params help while building: `?auto=<seconds>` changes the poll interval (10–600, default
120) and `?wx=` forces a backdrop. Preview a backdrop without waiting for the weather:
`http://localhost:4173/?wx=thunder`, `?wx=clear`, `?wx=overcast`, and so on. Valid values are
`clear`, `mostly-clear`, `cloudy`, `overcast`, `fog`, `drizzle`, `rain`, `downpour`, `thunder`, and
`windy`.

It is all CSS — `transform` and `opacity` only, no canvas, no library — with a few near-camera drops
(heavier, slightly blurred, faster) so the rain reads as having depth instead of looking like scratches.
Everything is disabled under `prefers-reduced-motion`, and the layer is `aria-hidden` with
`pointer-events: none`, so it never intercepts a click or a screen reader.

## Earthquakes

`/earthquakes/` is a second static route. It reads the **EMSC SeismicPortal** catalogue (free FDSN
service, no key, CORS open) for the box 4–22°N × 114–128°E, M2.5 and up, and shows it three ways:
a heat map of where they cluster, one plain-language card for the selected event, and the most recent
ten. The 7 / 30 / 90-day switch is a client-side filter — one request serves all three windows.

**Why EMSC and not PHIVOLCS directly.** PHIVOLCS has no API: `earthquake.phivolcs.dost.gov.ph` is a
2 MB HTML table with no CORS header, so a browser cannot fetch it from a static page. EMSC's catalogue
tags each event with the agency that authored the solution, and most Philippine events carry
`auth: "PIVS"` — PHIVOLCS itself. So the numbers are the official ones, delivered over an endpoint
that works from the browser. USGS was the other free option, but it only resolves M4.5+ in the
Philippines (46 events in 30 days, versus 245 here).

**The map** (`components/QuakeMap.tsx`) is inline SVG, no tile server and no library. The coastline is
Natural Earth 1:50m, simplified once into `lib/ph-outline.json` (~12 KB) by `scripts/build-outline.mjs`.
Density is a warm radial gradient per event blended with `screen`, so clusters accumulate; dots carry
the magnitude colour and anything from the last 24 hours keeps a slow ripple. The projection is
equirectangular corrected by `cos(mid-latitude)`, which is accurate enough over 18° of latitude.

Zoom and pan are the same SVG — no Leaflet: wheel, double-click, pinch, drag, plus `+ / − / reset`
buttons (1× to 7×, clamped so the archipelago can never be dragged off the frame). Sea labels are
counter-scaled by the zoom factor so they move with the map but keep their size. On a phone at 1× the
map leaves vertical scrolling to the page (`touch-action: pan-y`); once zoomed it takes the gesture
(`touch-action: none`) so dragging pans instead of scrolling. Because pointer capture retargets clicks
to the `<svg>`, a dot is selected on pointer-*up* from the element recorded on pointer-down — a press
that becomes a drag pans without selecting anything.

**Rate limits.** The service publishes no hard cap, so the page sets its own, and every one of these is
a real guard in `lib/quakes.ts`:

| Guard | Value | Why |
| --- | --- | --- |
| Cache fresh window | 10 min | A reload inside 10 minutes costs **zero** requests |
| Auto poll | 5 min, paused when the tab is hidden | Earthquakes are not a per-second phenomenon |
| Manual refresh cooldown | 60 s | Stops a fidgety click from becoming traffic |
| Daily budget | 200 calls, counted per browser per day in `localStorage` | The ceiling that matters if a tab is left open |
| After a refusal | 15 min backoff (honours `Retry-After` on a 429) | Back off instead of retrying into the wall |
| Cache max age | 12 h | Past this, stale numbers would be dishonest |

When the budget is spent or the call fails, the page keeps the last good payload, says
"showing the last saved reading from 3:41 PM" in an amber banner, and offers *Try now*. The footer
shows `n of 200 API calls today`, so the budget is never a mystery.

## Typhoons

A panel on the Weather tab, above El Niño: the Philippine Area of Responsibility drawn from PAGASA's
published vertices (5°N 115°E → 15°N 115°E → 21°N 120°E → 25°N 120°E → 25°N 135°E → 5°N 135°E), the
storm's track against it, and three facts — strength, movement, closest approach to the station you are
looking at. Nothing else.

**Data.** GDACS (the EU/JRC multi-agency alert feed) publishes the track as GeoJSON polygons: one ring
per 12-hour step per wind threshold, which also gives the wind radii. It is free, key-less and
CORS-open — verified with an `Origin` header — so the browser calls it directly. PAGASA's own bullets
have no API and no CORS, so the boundary is drawn from their coordinates instead.

Two caveats worth knowing:

- GDACS lists **alert-worthy** cyclones (Orange/Red). A weak tropical depression that PAGASA would
  still name may not appear. When nothing qualifies, the panel says so and draws the PAR on its own.
- One episode carries roughly the last two days plus the forecast, which is why the panel shows the
  current approach and entry rather than a month of history. `?storm=<eventid>:<episode>` forces any
  storm in the record — e.g. `?storm=1001194:14` for PODUL-25 crossing the northern PAR in August 2025.

**Motion** is CSS, not canvas: three spiral arms sweep counter-clockwise out of the eye with chevrons
at their tips, a dashed ring turns behind them at half the speed, the forecast dashes flow along the
track, and everything stops under `prefers-reduced-motion`. The arms are generated as spirals, not
arcs — arcs at that size read as a loading spinner, spirals read as wind. Phase is
derived, not declared: inside PAR, approaching (the forecast crosses in), outside, or past — with a
36-hour cutoff, because GDACS keeps an event "current" for days after it fades.

**Rate limits.** The list is fetched at most every 30 minutes and the track geometry (≈225 KB per storm)
is cached with it; at most two tracks are fetched per refresh, and a `?storm=` lookup is two calls. The
panel footer shows today's call count beside the weather page's own budget line.


## Day theme

The site ships two themes and no flash of the wrong one. The day theme lives in
`public/theme-day.css` — a second stylesheet that is loaded but not applied
(`media="not all"`). An inline script in `app/layout.tsx` switches it on before
first paint from the stored choice or the OS preference, and the moon/sun button in
the header flips it later.

Two implementation notes that cost time to discover:

- **React owns `<html>`.** Setting `data-theme` on the root element from a script
  works for one frame, then hydration resets it (traced: set at 43 ms, cleared at
  67 ms). The same happens to a `<link>` React renders. So the stylesheet is
  created by the script itself, with a `<link rel="preload">` so it is cached
  before it is needed.
- **The day theme is a remap, not a second design.** The page is built on
  white-alpha utilities; the day sheet flips `--glass-tint` to ink and remaps
  those utilities (`[class~="text-white/50"] { ... }`), so one class does the work
  of a refactor. The two SVG maps read a small set of `--map-*` custom
  properties, which is what lets them re-skin without touching their geometry.


## Rain near you

A card under the hero that answers one question for the point you are standing on: is rain coming, and
when. It only appears with a real position — otherwise it offers a button and explains that it would
follow the nearest station.

**Data.** One Open-Meteo request carries current precipitation plus the next 12 hours in 15-minute
steps (≈1.8 KB). The place name comes from Nominatim, which is the only free reverse geocoder tested
that resolves a landmark — IT Park in Cebu comes back as "Cebu I.T. Park, Cebu City", where
BigDataCloud only manages "Cebu City". Their policy is one request per second, so the name is cached
per position for a day and credited in the card.

**The honest limit.** Ask Open-Meteo for IT Park (10.3305, 123.9065) and it answers for a grid point
7.06 km away — that is the model's resolution here. So your position is exact and the forecast is not:
the card says "forecast grid point 7 km from you" and calls itself a 15-minute model rather than radar.
Rain cells can miss a street by 2 km, which is why the verdict is about your part of the city.

**What it says** is decided in one function (`verdictFor` in `lib/rain.ts`), in this order: it is
raining now (and when it eases) → rain starts in N minutes or around a clock time → dry but the model
has rain nearby at ≥55% → dry for six hours. Intensity is millimetres per 15 minutes turned into
light/moderate/heavy, and the headline never hides the caveat.

**Rate limits.** A reading is reused for 10 minutes, so a reload costs nothing; the card re-checks
every 10 minutes while the tab is visible; 150 checks a day per browser; on a refusal it keeps the last
reading with its timestamp. The strip covers the same six hours the verdict talks about — one bar per
15 minutes, with a hairline axis so a dry forecast still reads as a timeline. The footer shows `n of 150 checks used today`, and the whole card is one
request — the bars, the verdict and the countdown all come from that single payload.

`?rain=now|soon|maybe|dry` forces each verdict state for testing, the same way `?wx=` forces a
backdrop.

## Where the data comes from

| Data | Source | Refresh |
| --- | --- | --- |
| Current conditions, daily + hourly forecasts | Open-Meteo (`api.open-meteo.com`), CC BY 4.0 | Live, every page load |
| Rain at your coordinates (15-minute) | Open-Meteo `minutely_15`, ~7 km grid in Cebu | Live, every 10 min |
| Place names for the rain card | Nominatim (OpenStreetMap), cached a day per position | Once per location |
| Earthquakes (M2.5+, Philippine box) | EMSC SeismicPortal FDSN catalogue; PHIVOLCS solutions carry `auth: PIVS` | Live, every 5 min |
| Typhoon tracks | GDACS tropical-cyclone alerts (JTWC/NOAA tracks); PAR boundary from PAGASA's published coordinates | Live, every 30 min |
| Coastline for the quake map | Natural Earth 1:50m admin-0, frozen into `lib/ph-outline.json` | At build time, via `scripts/build-outline.mjs` |
| Oceanic Niño Index | NOAA CPC `oni.ascii.txt`, frozen into `lib/oni.json` | At build time |
| 1991–2020 climate normals (monthly rain, monthly mean daily max) | Open-Meteo Archive API (ERA5), frozen into `lib/climate.json` | At build time, via `scripts/build-climate.mjs` |

The rain/heat cards compare the last 90 and 30 days against those normals, pro-rated by month length.
That is a local drought signal, **not** a PAGASA declaration — PAGASA declares drought from three
consecutive months of far-below-normal rain.

### A note on the free tier

Open-Meteo's free limit is 5,000 units/hour, weighted by location × variable. The 28-station request
is the expensive one, so history is fetched separately for the home city only (`fetchHistory`) instead
of asking for `past_days=92` on all 28 stations — that one change cut the per-load cost by roughly an
order of magnitude. A 429 surfaces as a friendly "wait a minute, then hit Refresh" message.

The ONI is a **3-month running mean**, published monthly — it lags reality by design and is a
measurement, not a forecast. `lib/oni.json` holds the full 1950 → present series (921 seasons, ~15 KB),
so the El Niño panel computes the event list, peak ranking, and onset ramp from the data rather than
hardcoding any of it.

To refresh the index, re-download the file and regenerate `lib/oni.json`:

```bash
curl -s https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt -o oni.txt
python3 - <<'PY'
import json
seasons, years, values = [], [], []
for line in open("oni.txt"):
    p = line.split()
    if len(p) == 4 and p[1].isdigit() and p[0] in {"DJF","JFM","FMA","MAM","AMJ","MJJ","JJA","JAS","ASO","SON","OND","NDJ"}:
        try: v = round(float(p[3]), 2)
        except ValueError: continue
        seasons.append(p[0]); years.append(int(p[1])); values.append(v)
json.dump({"source": "NOAA CPC oni.ascii.txt", "seasons": seasons, "years": years, "values": values},
          open("lib/oni.json", "w"), separators=(",", ":"))
PY
```

## Layout of the code

```
app/
  layout.tsx        fonts, ambient backdrop, metadata
  page.tsx          renders <Dashboard/> (weather)
  earthquakes/
    page.tsx        renders <QuakeDashboard/> (earthquakes)
  globals.css       design tokens, glass surfaces, aurora backdrop, motion
components/
  SiteNav.tsx       sticky bar: wordmark, Weather/Earthquakes tabs, page controls
  Dashboard.tsx     weather: data fetching, clock, selection state, composition
  ExtremeCard.tsx   one top-five ranking list (heat or chill tone)
  ElNinoPanel.tsx   ONI readout, gauge, 30-year chart, super-event history
  ForecastPanel.tsx station chips, selected station, 5 days, 24-hour ribbon
  TyphoonPanel.tsx  storms vs PAR: lead sentence, three facts, empty state
  TyphoonMap.tsx    SVG map — PAR polygon, past/forecast track, circulation glyph
  QuakeDashboard.tsx earthquakes: fetching, rate-limit guards, composition
  QuakeMap.tsx      SVG heat map — density glow, magnitude dots, tap to select
  QuakeList.tsx     the "most recent" rows
  RainCard.tsx      rain at your coordinates: verdict, 6-hour strip, fallback CTA
  WeatherIcon.tsx   hand-drawn WMO condition icons
lib/
  cities.ts         28 stations with coordinates and island group
  weather.ts        Open-Meteo client, WMO→condition mapping, formatters
  elnino.ts         ONI analysis: current event, peak rank, onset ramp
  climate.ts        rain/heat vs 1991–2020 normals, dry-spell status
  quakes.ts         EMSC client, cache + rate-limit guards, magnitude words
  rain.ts           Open-Meteo 15-minute rain, verdict logic, Nominatim place, cache
  typhoons.ts       GDACS client, PAR polygon + point-in-polygon, track steps, phases
  oni.json          frozen NOAA series
  climate.json      frozen monthly normals for all 28 stations
  ph-outline.json   frozen simplified coastline for the quake map
scripts/
  build-climate.mjs regenerates lib/climate.json from the archive API
  build-outline.mjs regenerates lib/ph-outline.json from Natural Earth
  current-conditions.mjs prints every station's live condition (handy for finding
                          a rainy city to test the backdrop against)
```

## Notes / things worth knowing

- The page is a client-side fetcher on purpose: a static export gets fresh numbers on every visit
  instead of numbers baked at build time. If Open-Meteo is unreachable the page shows a retry card
  rather than stale data.
- "Super El Niño" is an informal label for ONI ≥ +2.0 °C; NOAA's own top tier is "very strong"
  (≥ +1.5 °C). Both lines are labelled on the chart.
- The coldest stations are mostly uplands (Baguio, Tagaytay, Kabayan, Malaybalay) — the list says so,
  because a 22 °C reading at 1,500 m is not the same story as 22 °C at sea level.
- Station set is intentionally regional and small: 28 points spread across Luzon, Visayas, and
  Mindanao, not every PAGASA synoptic station.
- The outlook opens on the **station nearest the visitor** — silent GPS when the browser already trusts
  the site, an IP lookup otherwise, snapped to the closest of the 28 stations (`lib/geo.ts`). Outside
  the country it falls back to Cebu City (`DEFAULT_CITY_ID`) and says so. `?at=lat,lon` forces a
  position for testing.
