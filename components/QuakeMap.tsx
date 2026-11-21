"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import outline from "@/lib/ph-outline.json";
import { MAG_BANDS, PH_BOX, bandFor, type Quake } from "@/lib/quakes";

const W = 620;
const PAD = 12;
const LON_SPAN = PH_BOX.maxLon - PH_BOX.minLon;
const LAT_SPAN = PH_BOX.maxLat - PH_BOX.minLat;
/** Equirectangular, corrected so 1° of longitude is as wide as 1° of latitude at mid-PH. */
const K_MID = Math.cos((((PH_BOX.minLat + PH_BOX.maxLat) / 2) * Math.PI) / 180);
const SCALE = (W - PAD * 2) / (LON_SPAN * K_MID);
const H = LAT_SPAN * SCALE + PAD * 2;

const MIN_K = 1;
const MAX_K = 7;

function px(lon: number): number {
  return PAD + (lon - PH_BOX.minLon) * K_MID * SCALE;
}

function py(lat: number): number {
  return PAD + (PH_BOX.maxLat - lat) * SCALE;
}

const RINGS = (outline as { rings: number[][][] }).rings;
const LAND = RINGS.map(
  (ring) => `M${ring.map(([lon, lat]) => `${px(lon).toFixed(1)} ${py(lat).toFixed(1)}`).join("L")}Z`,
).join(" ");

/** Faint graticule so the frame reads as a map, not a diagram. */
const GRATICULE = buildGraticule();

function buildGraticule(): { d: string }[] {
  const lines: { d: string }[] = [];
  for (let lon = 116; lon <= 126; lon += 2) {
    lines.push({ d: `M${px(lon).toFixed(1)} ${PAD}V${H - PAD}` });
  }
  for (let lat = 6; lat <= 20; lat += 2) {
    lines.push({ d: `M${PAD} ${py(lat).toFixed(1)}H${W - PAD}` });
  }
  return lines;
}

interface View {
  k: number;
  x: number;
  y: number;
}

/** Keep the frame full of map: no dragging the archipelago off the edge. */
function clampView({ k, x, y }: View): View {
  const zoom = Math.min(MAX_K, Math.max(MIN_K, k));
  return {
    k: zoom,
    x: Math.min(0, Math.max(W * (1 - zoom), x)),
    y: Math.min(0, Math.max(H * (1 - zoom), y)),
  };
}

interface Props {
  quakes: Quake[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Anything newer than this gets a pulse. */
  recentAfter: number;
}

function QuakeMap({ quakes, selectedId, onSelect, recentAfter }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  // Mirror for the listeners registered once, plus the pointer handlers below.
  const viewRef = useRef(view);
  viewRef.current = view;

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const pinch = useRef<{ dist: number; k: number } | null>(null);
  /** Set when a gesture moved, so releasing over a dot is a pan and not a selection. */
  const draggedRef = useRef(false);
  /**
   * The dot under the finger, recorded on pointer-down. Pointer capture retargets
   * the click to the <svg>, so selection is resolved on pointer-up from this.
   */
  const pressTarget = useRef<string | null>(null);

  const toUser = useCallback((clientX: number, clientY: number) => {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H,
    };
  }, []);

  const zoomAt = useCallback((factor: number, point?: { x: number; y: number }) => {
    setView((v) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      if (k === v.k) return v;
      const p = point ?? { x: W / 2, y: H / 2 };
      // Keep the point under the cursor fixed while the scale changes.
      return clampView({ k, x: p.x - ((p.x - v.x) * k) / v.k, y: p.y - ((p.y - v.y) * k) / v.k });
    });
  }, []);

  // Wheel needs a non-passive listener, otherwise the page scrolls under the map.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(Math.exp(-event.deltaY * 0.0016), toUser(event.clientX, event.clientY));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [toUser, zoomAt]);

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const dot = (event.target as Element | null)?.closest?.("[data-quake]");
    pressTarget.current = dot?.getAttribute("data-quake") ?? null;
    // At 1× on a phone, let the page scroll: there is nothing to pan yet.
    if (viewRef.current.k === 1 && event.pointerType === "touch") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    draggedRef.current = false;
    if (pointers.current.size === 1) {
      drag.current = {
        x: event.clientX,
        y: event.clientY,
        vx: viewRef.current.x,
        vy: viewRef.current.y,
      };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: viewRef.current.k };
      drag.current = null;
    }
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.dist > 0) {
        const target = (pinch.current.k * dist) / pinch.current.dist;
        zoomAt(target / viewRef.current.k, toUser((a.x + b.x) / 2, (a.y + b.y) / 2));
      }
      draggedRef.current = true;
      return;
    }

    const start = drag.current;
    const el = svgRef.current;
    if (!start || !el) return;
    const rect = el.getBoundingClientRect();
    const dx = ((event.clientX - start.x) / rect.width) * W;
    const dy = ((event.clientY - start.y) / rect.height) * H;
    if (Math.abs(event.clientX - start.x) > 3 || Math.abs(event.clientY - start.y) > 3) {
      draggedRef.current = true;
    }
    setView((v) => clampView({ k: v.k, x: start.vx + dx, y: start.vy + dy }));
  };

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;

    // A tap that didn't turn into a pan selects the dot it started on.
    if (wasSingle && !draggedRef.current && pressTarget.current) onSelect(pressTarget.current);
    if (pointers.current.size === 0) pressTarget.current = null;
  };

  const onPointerCancel = (event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    pinch.current = null;
    drag.current = null;
    pressTarget.current = null;
  };

  const dots = useMemo(
    () =>
      quakes.map((q) => {
        const band = bandFor(q.mag);
        return {
          q,
          band,
          cx: px(q.lon),
          cy: py(q.lat),
          r: Math.max(2, Math.min(7.5, 2 + (q.mag - 2.5) * 1.5)),
          glow: Math.max(9, Math.min(32, 9 + (q.mag - 2.5) * 6.5)),
        };
      }),
    [quakes],
  );

  const zoomed = view.k > 1.01;

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#060b18]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          style={{ touchAction: zoomed ? "none" : "pan-y", cursor: zoomed ? "grab" : "default" }}
          role="img"
          aria-label={`Map of ${quakes.length} earthquakes in and around the Philippines. Scroll or pinch to zoom, drag to pan.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onDoubleClick={(event) => zoomAt(1.9, toUser(event.clientX, event.clientY))}
        >
          <defs>
            <radialGradient id="quake-heat" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fb923c" stopOpacity="0.4" />
              <stop offset="45%" stopColor="#f43f5e" stopOpacity="0.19" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="quake-sea" cx="45%" cy="30%" r="75%">
              <stop offset="0%" stopColor="var(--map-sea-0, #0d1b33)" />
              <stop offset="60%" stopColor="var(--map-sea-1, #070d1c)" />
              <stop offset="100%" stopColor="var(--map-sea-2, #04060f)" />
            </radialGradient>
            <filter id="quake-blur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
          </defs>

          <rect width={W} height={H} fill="url(#quake-sea)" />

          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <g stroke="var(--map-grid, #7dd3fc)" strokeWidth="0.6" opacity="0.13">
              {GRATICULE.map((line) => (
                <path key={line.d} d={line.d} />
              ))}
            </g>

            {/* density: soft warm blobs that accumulate where the seismic zones are */}
            <g filter="url(#quake-blur)" style={{ mixBlendMode: "screen" }}>
              {dots.map(({ q, glow, cx, cy }) => (
                <circle key={`h-${q.id}`} cx={cx} cy={cy} r={glow} fill="url(#quake-heat)" />
              ))}
            </g>

            {/* land sits above the heat, so the glow reads as "under the islands" */}
            <g>
              <path d={LAND} fill="var(--map-land, #0b1526)" fillOpacity="0.96" stroke="var(--map-coast, #7dd3fc)" strokeOpacity="0.62" strokeWidth="1.1" />
              <path d={LAND} fill="none" stroke="var(--map-coast-soft, rgba(226,246,255,0.16))" strokeOpacity="1" strokeWidth="0.5" />
            </g>

            {/* epicentres */}
            <g>
              {dots.map(({ q, band, cx, cy, r }) => {
                const active = q.id === selectedId;
                return (
                  <g
                    key={q.id}
                    data-quake={q.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Magnitude ${q.mag.toFixed(1)} earthquake, ${q.region}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(q.id);
                      }
                    }}
                    className="cursor-pointer outline-none"
                  >
                    <circle cx={cx} cy={cy} r={Math.max(r + 6, 10)} fill="transparent" />
                    {q.time >= recentAfter && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r + 2}
                        fill="none"
                        stroke={band.color}
                        strokeWidth="1"
                        opacity="0.7"
                        className="quake-pulse"
                      />
                    )}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={band.color}
                      fillOpacity={active ? 1 : 0.85}
                      stroke={active ? "var(--map-dot-active, #ffffff)" : "var(--map-dot-ring, rgba(5,10,22,0.75))"}
                      strokeWidth={active ? 1.8 : 0.8}
                    />
                    {active && (
                      <circle cx={cx} cy={cy} r={r + 6.5} fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.55" />
                    )}
                  </g>
                );
              })}
            </g>

            {/* Sea names move with the map but keep their size, so zooming never fills
                the frame with a giant "SOUTH CHINA SEA". */}
            <g className="map-legend" fill="var(--map-label, #7dd3fc)" fontSize={9.5 / view.k} fontFamily="var(--font-sans)">
              <text x={PAD + 6 / view.k} y={H * 0.42} transform={`rotate(-90 ${PAD + 6} ${H * 0.42})`}>
                SOUTH CHINA SEA
              </text>
              <text x={W - PAD - 96 / view.k} y={H * 0.34}>
                PHILIPPINE SEA
              </text>
              <text x={W * 0.52} y={H - PAD - 10 / view.k}>
                CELEBES SEA
              </text>
            </g>
          </g>
        </svg>

        {/* zoom controls */}
        <div className="absolute right-2.5 top-2.5 flex flex-col overflow-hidden rounded-xl border border-white/[0.12] bg-[#08101f]/85 backdrop-blur">
          <button
            type="button"
            onClick={() => zoomAt(1.6)}
            disabled={view.k >= MAX_K - 0.01}
            aria-label="Zoom in"
            title="Zoom in"
            className="grid h-8 w-8 place-items-center text-[15px] font-semibold text-white/75 transition hover:bg-white/10 hover:text-white disabled:opacity-35"
          >
            +
          </button>
          <span className="h-px w-full bg-white/10" />
          <button
            type="button"
            onClick={() => zoomAt(1 / 1.6)}
            disabled={!zoomed}
            aria-label="Zoom out"
            title="Zoom out"
            className="grid h-8 w-8 place-items-center text-[15px] font-semibold text-white/75 transition hover:bg-white/10 hover:text-white disabled:opacity-35"
          >
            −
          </button>
          <span className="h-px w-full bg-white/10" />
          <button
            type="button"
            onClick={() => setView({ k: 1, x: 0, y: 0 })}
            disabled={!zoomed}
            aria-label="Reset zoom"
            title="Reset zoom"
            className="grid h-8 w-8 place-items-center text-[11px] text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-35"
          >
            ⤢
          </button>
        </div>

        {zoomed && (
          <span className="tnum pointer-events-none absolute bottom-2.5 right-2.5 rounded-full border border-white/10 bg-[#08101f]/85 px-2 py-0.5 text-[10px] text-white/55 backdrop-blur">
            {view.k.toFixed(1)}×
          </span>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[10.5px] text-white/45">
        {MAG_BANDS.slice()
          .reverse()
          .map((band) => (
            <span key={band.key} className="flex items-center gap-1.5" title={band.meaning}>
              <span className="h-2 w-2 rounded-full" style={{ background: band.color }} />
              {band.label}
            </span>
          ))}
        <span className="text-white/30">· scroll or pinch to zoom, drag to pan</span>
      </div>
    </div>
  );
}

export default memo(QuakeMap);
