"use client";

import type { ReactNode } from "react";

type Mood = "excellent" | "good" | "okay" | "mixed" | "poor" | "veryPoor" | "miserable" | "sleeping";

const MOODS: Record<Mood, { label: string; tint: [string, string] }> = {
  excellent: { label: "Splash-tastic!", tint: ["#fff3b0", "#ffd1e8"] },
  good: { label: "Swim time!", tint: ["#d9fbe9", "#c9f1ff"] },
  okay: { label: "Pretty good!", tint: ["#e3f6ff", "#e8e0ff"] },
  mixed: { label: "Hmm, maybe...", tint: ["#fff1d6", "#ffe3ef"] },
  poor: { label: "Not great...", tint: ["#ffe6e6", "#efe6ff"] },
  veryPoor: { label: "Better not...", tint: ["#ffe0ea", "#e6e9ff"] },
  miserable: { label: "Nooo!", tint: ["#ffd9df", "#e2ddff"] },
  sleeping: { label: "Zzz... baths closed", tint: ["#e4e0ff", "#cfe3ff"] }
};

function pickMood(score: number, closed: boolean): Mood {
  if (closed) return "sleeping";
  if (score >= 8.6) return "excellent";
  if (score >= 7.2) return "good";
  if (score >= 5.8) return "okay";
  if (score >= 4.5) return "mixed";
  if (score >= 3) return "poor";
  if (score >= 1.5) return "veryPoor";
  return "miserable";
}

const INK = "#2b2350";

function SparkleEye({ cx }: { cx: number }) {
  return (
    <g>
      <ellipse cx={cx} cy={122} rx={11} ry={14} fill={INK} />
      <ellipse cx={cx} cy={128} rx={8} ry={6} fill="#5b4bb7" opacity={0.7} />
      <circle cx={cx - 4} cy={116} r={4.5} fill="#fff" />
      <circle cx={cx + 4} cy={129} r={2.2} fill="#fff" />
    </g>
  );
}

function Eyes({ mood }: { mood: Mood }) {
  const line = { stroke: INK, strokeWidth: 5, strokeLinecap: "round" as const, fill: "none" };
  if (mood === "excellent") {
    return (
      <g {...line}>
        <path d="M67 126 Q78 110 89 126" />
        <path d="M111 126 Q122 110 133 126" />
      </g>
    );
  }
  if (mood === "sleeping") {
    return (
      <g {...line}>
        <path d="M68 121 Q78 131 88 121" />
        <path d="M112 121 Q122 131 132 121" />
      </g>
    );
  }
  if (mood === "miserable") {
    return (
      <g {...line}>
        <path d="M68 114 L86 122 L68 130" />
        <path d="M132 114 L114 122 L132 130" />
      </g>
    );
  }
  return (
    <g>
      <SparkleEye cx={78} />
      <SparkleEye cx={122} />
      {mood === "mixed" || mood === "poor" || mood === "veryPoor" ? (
        <g stroke={INK} strokeWidth={4} strokeLinecap="round">
          <path d="M68 104 L85 98" />
          <path d="M132 104 L115 98" />
        </g>
      ) : null}
    </g>
  );
}

function Mouth({ mood }: { mood: Mood }) {
  const line = { stroke: INK, strokeWidth: 4.5, strokeLinecap: "round" as const, fill: "none" };
  switch (mood) {
    case "excellent":
    case "good":
      return (
        <g>
          <path d="M86 141 Q100 164 114 141 Z" fill="#c2185b" stroke={INK} strokeWidth={3.5} strokeLinejoin="round" />
          <path d="M92 151 Q100 160 108 151 Q100 147 92 151 Z" fill="#ff8fb8" />
        </g>
      );
    case "okay":
      return <path d="M89 144 Q100 154 111 144" {...line} />;
    case "mixed":
      return <path d="M88 148 q4 -5 8 0 t8 0 t8 0" {...line} />;
    case "poor":
      return <path d="M90 151 Q100 143 110 151" {...line} />;
    case "veryPoor":
      return <path d="M88 153 Q100 140 112 153" {...line} />;
    case "miserable":
      return <ellipse cx={100} cy={150} rx={10} ry={8} fill="#c2185b" stroke={INK} strokeWidth={3.5} />;
    case "sleeping":
      return <ellipse cx={100} cy={147} rx={5} ry={4} fill="#c2185b" stroke={INK} strokeWidth={3} />;
  }
}

function Sparkle({ x, y, size, color, delay }: { x: number; y: number; size: number; color: string; delay: string }) {
  const s = size;
  return (
    <path
      className="animate-twinkle"
      style={{ animationDelay: delay }}
      d={`M${x} ${y - s} Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s} Z`}
      fill={color}
    />
  );
}

function Heart({ x, y, size, color }: { x: number; y: number; size: number; color: string }) {
  const s = size / 10;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path className="animate-twinkle" d="M0 3 C0 -2 -7 -3 -7 2 C-7 6 0 9 0 11 C0 9 7 6 7 2 C7 -3 0 -2 0 3 Z" fill={color} />
    </g>
  );
}

function Extras({ mood }: { mood: Mood }) {
  const items: ReactNode[] = [];
  if (mood === "excellent" || mood === "good" || mood === "okay") {
    items.push(
      <Sparkle key="s1" x={30} y={60} size={11} color="#ffc93c" delay="0s" />,
      <Sparkle key="s2" x={172} y={92} size={8} color="#1fc8e3" delay="0.8s" />,
      <Sparkle key="s3" x={160} y={34} size={6} color="#ff4f9a" delay="1.4s" />
    );
  }
  if (mood === "excellent") {
    items.push(<Heart key="h1" x={170} y={140} size={16} color="#ff4f9a" />, <Heart key="h2" x={26} y={128} size={12} color="#ff8fb8" />);
  }
  if (mood === "mixed" || mood === "poor") {
    items.push(<path key="sweat" d="M150 92 Q158 106 150 112 Q142 106 150 92 Z" fill="#9fe6f5" stroke="#1fc8e3" strokeWidth={2} />);
  }
  if (mood === "veryPoor") {
    items.push(<path key="tear" d="M70 138 Q76 150 70 156 Q64 150 70 138 Z" fill="#9fe6f5" stroke="#1fc8e3" strokeWidth={2} />);
  }
  if (mood === "miserable") {
    items.push(
      <path key="t1" d="M66 128 Q60 150 64 172" stroke="#9fe6f5" strokeWidth={7} strokeLinecap="round" fill="none" />,
      <path key="t2" d="M134 128 Q140 150 136 172" stroke="#9fe6f5" strokeWidth={7} strokeLinecap="round" fill="none" />
    );
  }
  if (mood === "sleeping") {
    items.push(
      <text key="z" x={148} y={70} fontFamily="var(--font-display)" fontWeight={700} fill="#9b7bff">
        <tspan fontSize={22}>Z</tspan>
        <tspan fontSize={16} dx={2} dy={-12}>z</tspan>
        <tspan fontSize={12} dx={2} dy={-10}>z</tspan>
      </text>
    );
  }
  return <>{items}</>;
}

export function DawnFace({ score, closed = false }: { score: number; closed?: boolean }) {
  const mood = pickMood(score, closed);
  const { label, tint } = MOODS[mood];

  return (
    <div
      className="relative flex aspect-square w-full max-w-[320px] flex-col items-center justify-center overflow-hidden rounded-[32px] border-[3px] border-white sticker"
      style={{ background: `linear-gradient(160deg, ${tint[0]}, ${tint[1]})` }}
    >
      <svg viewBox="0 0 200 200" role="img" aria-label={`Mood buddy: ${label}`} className="h-[78%] w-[78%]">
        <defs>
          <linearGradient id="dropBody" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#8be9ff" />
            <stop offset="100%" stopColor="#38b6ff" />
          </linearGradient>
        </defs>
        <ellipse cx={100} cy={190} rx={46} ry={6} fill="#2b2350" opacity={0.1} />
        <g className={mood === "sleeping" ? undefined : "animate-bob"}>
          <path
            d="M100 22 C100 22 40 92 40 128 C40 162 67 186 100 186 C133 186 160 162 160 128 C160 92 100 22 100 22 Z"
            fill="url(#dropBody)"
            stroke={INK}
            strokeWidth={4}
            strokeLinejoin="round"
          />
          <path d="M70 92 Q60 110 60 128" stroke="#fff" strokeWidth={7} strokeLinecap="round" fill="none" opacity={0.6} />
          {/* Little flower clip */}
          <g transform="translate(124 64)">
            {[0, 72, 144, 216, 288].map((angle) => (
              <ellipse key={angle} cx={0} cy={-8} rx={6} ry={8} fill="#ff8fb8" transform={`rotate(${angle})`} stroke={INK} strokeWidth={2} />
            ))}
            <circle r={5} fill="#ffc93c" stroke={INK} strokeWidth={2} />
          </g>
          <ellipse cx={62} cy={142} rx={11} ry={6.5} fill="#ff7eb6" opacity={0.6} />
          <ellipse cx={138} cy={142} rx={11} ry={6.5} fill="#ff7eb6" opacity={0.6} />
          <Eyes mood={mood} />
          <Mouth mood={mood} />
        </g>
        <Extras mood={mood} />
      </svg>
      <p className="-mt-1 rounded-full bg-white/85 px-4 py-1 font-display text-lg font-semibold text-[var(--text)] sticker">{label}</p>
    </div>
  );
}
