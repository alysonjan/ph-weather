"use client";

import { memo } from "react";
import { bandFor, depthWords, timeAgo, type Quake } from "@/lib/quakes";

interface Props {
  quakes: Quake[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  now: number;
}

function QuakeList({ quakes, selectedId, onSelect, now }: Props) {
  return (
    <ul className="flex flex-col gap-1">
      {quakes.map((q) => {
        const band = bandFor(q.mag);
        const active = q.id === selectedId;
        return (
          <li key={q.id}>
            <button
              type="button"
              onClick={() => onSelect(q.id)}
              aria-pressed={active}
              data-quake={q.id}
              className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors ${
                active
                  ? "border-white/25 bg-white/15"
                  : "border-transparent bg-white/[0.03] hover:border-white/10 hover:bg-white/[0.07]"
              }`}
            >
              <span
                className="tnum grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[13px] font-semibold text-[#0a1024]"
                style={{ background: band.color }}
                title={band.meaning}
              >
                {q.mag.toFixed(1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium leading-tight text-white/90">
                  {q.region}
                </span>
                <span className="mt-0.5 block truncate text-[10.5px] text-white/40">
                  {depthWords(q.depth)} · {Math.round(q.depth)} km deep · {q.source}
                </span>
              </span>
              <span className="tnum shrink-0 text-[10.5px] text-white/45">{timeAgo(q.time, now)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default memo(QuakeList);
