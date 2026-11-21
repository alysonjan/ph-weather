"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

export type Surface = "weather" | "earthquakes";
type Theme = "day" | "night";

const THEME_KEY = "panahon:theme";

const TABS: { key: Surface; href: string; label: string }[] = [
  { key: "weather", href: "/", label: "Weather" },
  { key: "earthquakes", href: "/earthquakes/", label: "Earthquakes" },
];

const SUBTITLE: Record<Surface, string> = {
  weather: "Philippine weather · live",
  earthquakes: "Philippine earthquakes · live",
};

/** Sticky top bar: identity, the two surfaces, the light switch, and page controls. */
export default function SiteNav({ active, children }: { active: Surface; children?: ReactNode }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  // The day stylesheet is switched on before paint by an inline script; read that.
  useEffect(() => {
    const link = document.getElementById("theme-day");
    setTheme(link?.getAttribute("media") === "all" ? "day" : "night");
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === "day" ? "night" : "day";
    setTheme(next);
    const link = document.getElementById("theme-day");
    if (link) link.setAttribute("media", next === "day" ? "all" : "not all");
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private mode: the choice just won't survive the visit.
    }
  }, [theme]);

  const goingTo = theme === "day" ? "night" : "day";

  return (
    <header className="sticky top-3 z-30">
      <div className="glass flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-3.5 py-2.5">
        <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-orange-300 via-amber-200 to-sky-300 text-[#0a1024] shadow-[0_0_24px_-6px_rgba(251,191,36,0.9)]">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <circle cx="12" cy="10" r="3.2" />
            <path d="M12 3.2v1.6M12 15.2v1.6M5.2 10h1.6M17.2 10h1.6M7.2 5.2l1.1 1.1M15.7 13.7l1.1 1.1M16.8 5.2l-1.1 1.1M8.3 13.7l-1.1 1.1" strokeLinecap="round" />
            <path d="M7.5 20.5h9" strokeLinecap="round" opacity="0.55" />
          </svg>
        </div>

        <div className="min-w-0 shrink">
          <p className="font-display text-[13px] font-semibold leading-none tracking-[0.16em] text-white">
            PANAHON
          </p>
          <p className="mt-1 hidden text-[10px] leading-none text-white/40 sm:block">{SUBTITLE[active]}</p>
        </div>

        <nav className="flex shrink-0 rounded-full border border-white/10 bg-white/[0.04] p-0.5 sm:ml-3" aria-label="Sections">
          {TABS.map((tab) => {
            const current = tab.key === active;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors sm:px-3 ${
                  current ? "bg-white/15 text-white" : "text-white/60 hover:text-white/85"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex w-full items-center justify-end gap-2 sm:w-auto sm:gap-3">
          {children}

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${goingTo} theme`}
            title={`Switch to ${goingTo} theme`}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-white/65 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            {theme === "day" ? (
              // moon: tap to go back to night
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                <path d="M13 10.2A5.6 5.6 0 0 1 5.8 3a5.6 5.6 0 1 0 7.2 7.2Z" strokeLinejoin="round" />
              </svg>
            ) : (
              // sun: tap for daylight
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                <circle cx="8" cy="8" r="3" />
                <path d="M8 1.2v1.7M8 13.1v1.7M1.2 8h1.7M13.1 8h1.7M3.2 3.2l1.2 1.2M11.6 11.6l1.2 1.2M12.8 3.2l-1.2 1.2M4.4 11.6l-1.2 1.2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
