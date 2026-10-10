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

const INK = "#1d1838";
const OUTLINE = "#34507a";

function SealEyes({ mood }: { mood: Mood }) {
  const line = { stroke: INK, strokeWidth: 3.5, strokeLinecap: "round" as const, fill: "none" };
  const eye = (cx: number) => {
    if (mood === "excellent") return <path key={cx} d={`M${cx - 10} 94 Q${cx} 81 ${cx + 10} 94`} {...line} />;
    if (mood === "sleeping") return <path key={cx} d={`M${cx - 9} 90 Q${cx} 99 ${cx + 9} 90`} {...line} />;
    if (mood === "miserable") {
      const dir = cx < 100 ? 1 : -1;
      return <path key={cx} d={`M${cx - 8 * dir} 84 L${cx + 7 * dir} 91 L${cx - 8 * dir} 98`} {...line} />;
    }
    return (
      <g key={cx}>
        <ellipse cx={cx} cy={91} rx={10} ry={12} fill={INK} />
        <ellipse cx={cx} cy={97} rx={7} ry={5} fill="#5b4bb7" opacity={0.7} />
        <circle cx={cx - 3.5} cy={86} r={4} fill="#fff" />
        <circle cx={cx + 3.5} cy={96.5} r={2} fill="#fff" />
      </g>
    );
  };
  const sadBrows = mood === "mixed" || mood === "poor" || mood === "veryPoor";
  return (
    <g>
      {eye(74)}
      {eye(126)}
      {sadBrows ? (
        <g {...line} strokeWidth={3}>
          <path d="M64 76 L81 70" />
          <path d="M136 76 L119 70" />
        </g>
      ) : null}
    </g>
  );
}

// The mouth hangs from the nose: a short line down, then curves out to each side.
function SealMouth({ mood }: { mood: Mood }) {
  const line = { stroke: INK, strokeWidth: 2.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  const curves: Record<Mood, string> = {
    excellent: "M86 119 Q93 131 100 122 Q107 131 114 119",
    good: "M88 120 Q94 129 100 122 Q106 129 112 120",
    okay: "M91 122 Q95.5 127 100 122 Q104.5 127 109 122",
    mixed: "M90 125 L100 122 L110 125",
    poor: "M90 128 Q95 121 100 122 Q105 121 110 128",
    veryPoor: "M88 130 Q94 119 100 122 Q106 119 112 130",
    miserable: "M87 131 Q94 118 100 122 Q106 118 113 131",
    sleeping: "M93 123 Q96.5 126 100 122 Q103.5 126 107 123"
  };
  return (
    <g>
      <path d="M100 113 L100 130" {...line} />
      <g transform="translate(0 8)">
        <path d={curves[mood]} {...line} />
        {mood === "excellent" ? <path d="M96 125 Q100 133 104 125 Z" fill="#ff8fb8" stroke={INK} strokeWidth={2} strokeLinejoin="round" /> : null}
      </g>
    </g>
  );
}

// Tears and sweat sit on the face.
function SealFaceExtras({ mood }: { mood: Mood }) {
  if (mood === "mixed" || mood === "poor") {
    return <path d="M150 66 Q157 78 150 83 Q143 78 150 66 Z" fill="#c4f1fb" stroke="#1fc8e3" strokeWidth={2} />;
  }
  if (mood === "veryPoor") {
    return <path d="M68 104 Q73 114 68 119 Q63 114 68 104 Z" fill="#c4f1fb" stroke="#1fc8e3" strokeWidth={2} />;
  }
  if (mood === "miserable") {
    return (
      <g stroke="#c4f1fb" strokeWidth={5} strokeLinecap="round" fill="none">
        <path d="M70 99 Q66 116 68 132" />
        <path d="M130 99 Q134 116 132 132" />
      </g>
    );
  }
  return null;
}

function Seal({ mood }: { mood: Mood }) {
  return (
    <>
      <defs>
        <linearGradient id="sealFur" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#dcedf9" />
          <stop offset="100%" stopColor="#8db6da" />
        </linearGradient>
      </defs>
      <ellipse cx={100} cy={190} rx={58} ry={6} fill="#2b2350" opacity={0.1} />
      <g className={mood === "sleeping" ? undefined : "animate-bob"}>
        {/* Rear flippers */}
        <g fill="#9cc3e2" stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round">
          <path d="M132 174 Q156 166 170 176 Q160 180 166 190 Q148 188 132 184 Z" />
          <path d="M126 180 Q140 186 146 196 Q130 196 120 188 Z" />
        </g>
        {/* Round, chubby body (seals have no neck) */}
        <path
          d="M100 38 C142 38 162 70 162 110 C162 152 148 184 100 186 C52 184 38 152 38 110 C38 70 58 38 100 38 Z"
          fill="url(#sealFur)"
          stroke={OUTLINE}
          strokeWidth={3}
        />
        <ellipse cx={100} cy={158} rx={36} ry={24} fill="#eef6fc" opacity={0.85} />
        <path d="M64 56 Q78 46 94 45" stroke="#fff" strokeWidth={6} strokeLinecap="round" fill="none" opacity={0.6} />
        {/* Front flippers */}
        <ellipse cx={46} cy={150} rx={10} ry={22} fill="#9cc3e2" stroke={OUTLINE} strokeWidth={2.5} transform="rotate(28 46 150)" />
        <ellipse cx={154} cy={150} rx={10} ry={22} fill="#9cc3e2" stroke={OUTLINE} strokeWidth={2.5} transform="rotate(-28 154 150)" />
        {/* Speckles */}
        {[
          [80, 58],
          [120, 54],
          [140, 74],
          [56, 84],
          [146, 122],
          [58, 128],
          [126, 172],
          [76, 174]
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={2.2} fill="#4d6f9c" opacity={0.3} />
        ))}
        {/* Flower clip */}
        <g transform="translate(132 50) scale(0.9)">
          {[0, 72, 144, 216, 288].map((angle) => (
            <ellipse key={angle} cx={0} cy={-8} rx={6} ry={8} fill="#ff8fb8" transform={`rotate(${angle})`} stroke={OUTLINE} strokeWidth={2} />
          ))}
          <circle r={5} fill="#ffc93c" stroke={OUTLINE} strokeWidth={2} />
        </g>
        {/* Rosy cheeks */}
        <ellipse cx={58} cy={110} rx={10} ry={6} fill="#ff7aa8" opacity={0.5} />
        <ellipse cx={142} cy={110} rx={10} ry={6} fill="#ff7aa8" opacity={0.5} />
        <SealEyes mood={mood} />
        {/* Muzzle, whiskers and nose */}
        <ellipse cx={91} cy={117} rx={11} ry={8.5} fill="#f4f9fd" stroke={OUTLINE} strokeWidth={1.8} />
        <ellipse cx={109} cy={117} rx={11} ry={8.5} fill="#f4f9fd" stroke={OUTLINE} strokeWidth={1.8} />
        {[
          [86, 116],
          [90, 120],
          [94, 116],
          [106, 116],
          [110, 120],
          [114, 116]
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.1} fill={OUTLINE} opacity={0.6} />
        ))}
        <g stroke={OUTLINE} strokeWidth={1.6} strokeLinecap="round" opacity={0.75}>
          <path d="M80 114 L60 108" />
          <path d="M80 118 L58 119" />
          <path d="M81 122 L62 129" />
          <path d="M120 114 L140 108" />
          <path d="M120 118 L142 119" />
          <path d="M119 122 L138 129" />
        </g>
        <path d="M93 106 Q100 103 107 106 Q106 113 100 115 Q94 113 93 106 Z" fill={INK} />
        <ellipse cx={97.5} cy={107.5} rx={2.4} ry={1.4} fill="#fff" opacity={0.8} />
        <SealMouth mood={mood} />
        <SealFaceExtras mood={mood} />
      </g>
    </>
  );
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
      <Sparkle key="s1" x={22} y={40} size={11} color="#ffc93c" delay="0s" />,
      <Sparkle key="s2" x={180} y={150} size={8} color="#1fc8e3" delay="0.8s" />,
      <Sparkle key="s3" x={176} y={26} size={6} color="#ff4f9a" delay="1.4s" />
    );
  }
  if (mood === "excellent") {
    items.push(<Heart key="h1" x={24} y={150} size={14} color="#ff4f9a" />, <Heart key="h2" x={156} y={16} size={11} color="#ff8fb8" />);
  }
  if (mood === "sleeping") {
    items.push(
      <text key="z" x={150} y={40} fontFamily="var(--font-display)" fontWeight={700} fill="#9b7bff">
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
      <svg viewBox="0 0 200 200" role="img" aria-label={`Izzy the seal: ${label}`} className="h-[78%] w-[78%]">
        <Seal mood={mood} />
        <Extras mood={mood} />
      </svg>
      <p className="-mt-1 rounded-full bg-white/85 px-4 py-1 font-display text-lg font-semibold text-[var(--text)] sticker">{label}</p>
    </div>
  );
}
