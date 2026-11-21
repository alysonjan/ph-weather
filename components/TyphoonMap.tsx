"use client";

import { memo, useMemo } from "react";
import outline from "@/lib/ph-outline.json";
import { PAR, TYPHOON_BOX, pointInPar, type StormReport } from "@/lib/typhoons";

const W = 700;
const PAD = 10;
const LON_SPAN = TYPHOON_BOX.maxLon - TYPHOON_BOX.minLon;
const LAT_SPAN = TYPHOON_BOX.maxLat - TYPHOON_BOX.minLat;
const K_MID = Math.cos((((TYPHOON_BOX.minLat + TYPHOON_BOX.maxLat) / 2) * Math.PI) / 180);
const SCALE = (W - PAD * 2) / (LON_SPAN * K_MID);
const H = LAT_SPAN * SCALE + PAD * 2;
/** Kilometres per pixel, for the wind radii. */
const KM_PER_PX = 111.32 / SCALE;

function px(lon: number): number {
  return PAD + (lon - TYPHOON_BOX.minLon) * K_MID * SCALE;
}

function py(lat: number): number {
  return PAD + (TYPHOON_BOX.maxLat - lat) * SCALE;
}

const RINGS = (outline as { rings: number[][][] }).rings;
const LAND = RINGS.map(
  (ring) => `M${ring.map(([lon, lat]) => `${px(lon).toFixed(1)} ${py(lat).toFixed(1)}`).join("L")}Z`,
).join(" ");

const PAR_PATH = `M${PAR.map(([lon, lat]) => `${px(lon).toFixed(1)} ${py(lat).toFixed(1)}`).join("L")}Z`;

/**
 * The circulation glyph: spiral arms that curve out of the eye, so the marker
 * reads as wind turning rather than a spinner. Generated once — the eye only
 * translates, the shape never changes.
 */
const SPIRAL_TURNS = 0.62;
const SPIRAL_R0 = 4;
const SPIRAL_R1 = 24;
const SPIRAL_STEPS = 26;

function spiralPoints(cx: number, cy: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= SPIRAL_STEPS; i += 1) {
    const t = i / SPIRAL_STEPS;
    const angle = -Math.PI / 2 - t * SPIRAL_TURNS * Math.PI * 2;
    const radius = SPIRAL_R0 + (SPIRAL_R1 - SPIRAL_R0) * t;
    points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  return points;
}

const SPIRAL_ARMS = [0, 1, 2].map((i) => ({
  i,
  d: (cx: number, cy: number) =>
    spiralPoints(cx, cy)
      .map((point, k) => `${k === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" "),
  /** Chevron at the tip, pointing the way the wind is sweeping. */
  head: (cx: number, cy: number) => {
    const points = spiralPoints(cx, cy);
    const tip = points[points.length - 1];
    const before = points[points.length - 3];
    const angle = Math.atan2(tip.y - before.y, tip.x - before.x);
    const size = 4.4;
    const left = { x: tip.x - Math.cos(angle - 0.62) * size, y: tip.y - Math.sin(angle - 0.62) * size };
    const right = { x: tip.x - Math.cos(angle + 0.62) * size, y: tip.y - Math.sin(angle + 0.62) * size };
    return `M${left.x.toFixed(2)} ${left.y.toFixed(2)} L${tip.x.toFixed(2)} ${tip.y.toFixed(2)} L${right.x.toFixed(2)} ${right.y.toFixed(2)}`;
  },
}));

function pathFor(points: { lon: number; lat: number }[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.lon).toFixed(1)} ${py(p.lat).toFixed(1)}`).join(" ");
}

function TyphoonMap({ report }: { report: StormReport | null }) {
  const storm = report?.storm ?? null;
  const current = report?.current ?? null;
  const category = report?.category ?? null;

  const geometry = useMemo(() => {
    const steps = storm?.steps ?? [];
    if (!steps.length) return { pastPath: "", futurePath: "", stepDots: [] };
    const index = current ? steps.findIndex((s) => s.time === current.time) : steps.length - 1;
    const split = index < 0 ? steps.length - 1 : index;
    const past = steps.slice(0, split + 1);
    const future = steps.slice(split);
    return {
      pastPath: past.length > 1 ? pathFor(past) : "",
      futurePath: future.length > 1 ? pathFor(future) : "",
      stepDots: steps.map((s) => ({ ...s, x: px(s.lon), y: py(s.lat) })),
    };
  }, [storm, current]);

  const eye = current ? { x: px(current.lon), y: py(current.lat) } : null;
  const tone = category?.tone ?? "sky";
  const strokeColor = tone === "rose" ? "#fb7185" : tone === "amber" ? "#fbbf24" : "#7dd3fc";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#060b18]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={
          storm
            ? `Track of ${storm.name} against the Philippine Area of Responsibility. ${
                report?.phase === "inside"
                  ? "Currently inside PAR."
                  : report?.phase === "approaching"
                    ? "Approaching PAR."
                    : "Outside PAR."
              }`
            : "The Philippine Area of Responsibility, with no typhoon inside it."
        }
      >
        <defs>
          <radialGradient id="ty-sea" cx="40%" cy="28%" r="80%">
            <stop offset="0%" stopColor="var(--map-sea-0, #0d1b33)" />
            <stop offset="60%" stopColor="var(--map-sea-1, #070d1c)" />
            <stop offset="100%" stopColor="var(--map-sea-2, #04060f)" />
          </radialGradient>
          <radialGradient id="ty-wind" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.34" />
            <stop offset="70%" stopColor={strokeColor} stopOpacity="0.13" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width={W} height={H} fill="url(#ty-sea)" />

        {/* graticule every 4° */}
        <g stroke="var(--map-grid, #7dd3fc)" strokeWidth="0.5" opacity="0.13">
          {Array.from({ length: 9 }, (_, i) => 112 + i * 4).map((lon) => (
            <path key={`v${lon}`} d={`M${px(lon).toFixed(1)} ${PAD}V${H - PAD}`} />
          ))}
          {Array.from({ length: 8 }, (_, i) => 4 + i * 4).map((lat) => (
            <path key={`h${lat}`} d={`M${PAD} ${py(lat).toFixed(1)}H${W - PAD}`} />
          ))}
        </g>

        {/* PAR: the area PAGASA monitors, drawn from the published coordinates */}
        <path d={PAR_PATH} fill="var(--par-edge, #38bdf8)" fillOpacity="0.1" stroke="var(--par-edge, #38bdf8)" strokeOpacity="0.9" strokeWidth="1.6" strokeDasharray="8 5" />
        <text x={px(129.6)} y={py(3.9)} className="map-legend" fill="var(--map-label, #7dd3fc)" fontSize="9.5" letterSpacing="0.12em">
          PHILIPPINE AREA OF RESPONSIBILITY (PAR)
        </text>

        <path d={LAND} fill="var(--map-land, #0b1526)" fillOpacity="0.95" stroke="var(--map-coast, #7dd3fc)" strokeOpacity="0.66" strokeWidth="1" />

        {/* wind radii at the current position */}
        {current && (
          <g>
            <circle cx={eye!.x} cy={eye!.y} r={Math.max(6, current.r60 / KM_PER_PX)} fill="url(#ty-wind)" />
            <circle
              cx={eye!.x}
              cy={eye!.y}
              r={Math.max(3, current.r120 / KM_PER_PX)}
              fill="none"
              stroke={strokeColor}
              strokeOpacity="0.35"
              strokeWidth="0.8"
              strokeDasharray="3 3"
            />
          </g>
        )}

        {/* track: solid behind the storm, dashed and flowing ahead of it */}
        {geometry.pastPath && (
          <path d={geometry.pastPath} fill="none" stroke="var(--map-track, #e2f6ff)" strokeOpacity="0.85" strokeWidth="2" strokeLinecap="round" />
        )}
        {geometry.futurePath && (
          <path
            d={geometry.futurePath}
            fill="none"
            stroke={strokeColor}
            strokeOpacity="1"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="5 6"
            className="typhoon-track"
          />
        )}

        {geometry.stepDots.map((step) => (
          <circle
            key={step.time}
            cx={step.x}
            cy={step.y}
            r={step.forecast ? 1.8 : 2.4}
            fill={step.forecast ? strokeColor : "var(--map-track, #e2f6ff)"}
            fillOpacity={step.forecast ? 0.75 : 0.5}
          />
        ))}

        {/* the storm itself: spiral arms sweeping counter-clockwise out of the eye */}
        {eye && (
          <g>
            <circle cx={eye.x} cy={eye.y} r={34} fill={strokeColor} fillOpacity="0.09" />
            <circle
              cx={eye.x}
              cy={eye.y}
              r={29}
              fill="none"
              stroke={strokeColor}
              strokeOpacity="0.28"
              strokeWidth="0.9"
              strokeDasharray="1.5 5"
              className="typhoon-spin-slow"
              style={{ transformBox: "view-box", transformOrigin: `${eye.x}px ${eye.y}px` }}
            />
            <g
              className="typhoon-spin"
              style={{ transformBox: "view-box", transformOrigin: `${eye.x}px ${eye.y}px` }}
              stroke={strokeColor}
              fill="none"
              strokeLinecap="round"
            >
              {SPIRAL_ARMS.map((arm) => (
                <g key={arm.i} transform={`rotate(${arm.i * 120} ${eye.x} ${eye.y})`}>
                  {/* a wide faint pass under a fine bright one reads as a tapered ribbon */}
                  <path d={arm.d(eye.x, eye.y)} strokeWidth="4.2" strokeOpacity="0.18" strokeLinecap="round" />
                  <path d={arm.d(eye.x, eye.y)} strokeWidth="1.7" strokeOpacity="0.92" strokeLinecap="round" />
                  <path
                    d={arm.head(eye.x, eye.y)}
                    strokeWidth="1.8"
                    strokeOpacity="0.95"
                    strokeLinejoin="round"
                  />
                </g>
              ))}
            </g>
            <circle cx={eye.x} cy={eye.y} r={3.2} fill="#fff" fillOpacity="0.95" />
            <text x={eye.x + 26} y={eye.y - 20} fill="#fff" fillOpacity="0.86" fontSize="10.5" fontWeight="600">
              {storm?.name}
            </text>
          </g>
        )}

        <g className="map-legend" fill="var(--map-label, #7dd3fc)" fontSize="8.5" letterSpacing="0.12em" fontFamily="var(--font-sans)">
          <text x={PAD + 5} y={H * 0.62} transform={`rotate(-90 ${PAD + 5} ${H * 0.62})`}>
            WEST PHILIPPINE SEA
          </text>
          <text x={W - PAD - 104} y={H * 0.48}>
            PHILIPPINE SEA
          </text>
        </g>
      </svg>

      <div className="pointer-events-none absolute bottom-2 left-2.5 flex items-center gap-3 rounded-full border border-white/10 bg-[#08101f]/80 px-2.5 py-1 text-[9.5px] text-white/45 backdrop-blur">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-white/55" /> track
        </span>
        {geometry.futurePath && (
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full" style={{ background: strokeColor }} /> forecast
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full border-t border-dashed border-sky-400/70" /> PAR edge
        </span>
      </div>
    </div>
  );
}

export default memo(TyphoonMap);
