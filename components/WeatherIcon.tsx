import type { Condition } from "@/lib/weather";

interface Props {
  condition: Condition;
  isDay?: boolean;
  className?: string;
  strokeWidth?: number;
}

const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];

function Sun({ strokeWidth }: { strokeWidth: number }) {
  return (
    <g>
      <circle cx="16" cy="16" r="6" strokeWidth={strokeWidth} />
      {RAYS.map((deg) => (
        <line
          key={deg}
          x1="16"
          y1="4.2"
          x2="16"
          y2="7.4"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          transform={`rotate(${deg} 16 16)`}
        />
      ))}
    </g>
  );
}

function Moon({ strokeWidth }: { strokeWidth: number }) {
  return (
    <path
      d="M21.5 19.2A8.5 8.5 0 0 1 12.8 8.5a8.6 8.6 0 0 1 1.1-4.1 8.8 8.8 0 1 0 9.6 13.8 8.7 8.7 0 0 1-2 .9Z"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
  );
}

function Cloud({ strokeWidth, cx = 0 }: { strokeWidth: number; cx?: number }) {
  return (
    <path
      d={`M${8 + cx} 22h12.5a4.5 4.5 0 0 0 .3-9A6.5 6.5 0 0 0 8.7 12 5 5 0 0 0 ${8 + cx} 22Z`}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}

export default function WeatherIcon({ condition, isDay = true, className, strokeWidth = 1.6 }: Props) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
  } as const;

  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" {...common}>
      {condition === "clear" && (isDay ? <Sun strokeWidth={strokeWidth} /> : <Moon strokeWidth={strokeWidth} />)}

      {condition === "mostly-clear" && (
        <>
          <g transform="translate(-3 -1) scale(0.82)">{isDay ? <Sun strokeWidth={strokeWidth} /> : <Moon strokeWidth={strokeWidth} />}</g>
          <Cloud strokeWidth={strokeWidth} cx={6} />
        </>
      )}

      {(condition === "cloudy" || condition === "overcast") && <Cloud strokeWidth={strokeWidth} cx={2} />}

      {condition === "fog" && (
        <>
          <Cloud strokeWidth={strokeWidth} cx={2} />
          <line x1="7" y1="26" x2="23" y2="26" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.75" />
          <line x1="10" y1="29.5" x2="21" y2="29.5" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.45" />
        </>
      )}

      {(condition === "drizzle" || condition === "rain" || condition === "downpour") && (
        <>
          <Cloud strokeWidth={strokeWidth} cx={2} />
          <g strokeWidth={strokeWidth} strokeLinecap="round" opacity={condition === "drizzle" ? 0.6 : 0.95}>
            <line x1="11" y1="25.5" x2="10" y2="28.5" />
            {condition !== "drizzle" && <line x1="16" y1="25.5" x2="15" y2="29" />}
            <line x1="21" y1="25.5" x2="20" y2="28.5" />
          </g>
        </>
      )}

      {condition === "thunder" && (
        <>
          <Cloud strokeWidth={strokeWidth} cx={2} />
          <path d="M17 24.5l-3.2 4.6h3.1l-1 3.4 3.9-5.2h-3Z" strokeWidth={strokeWidth} strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
