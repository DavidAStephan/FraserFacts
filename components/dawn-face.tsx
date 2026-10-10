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

// Tears and sweat sit on the face, so they move with it.
function FaceExtras({ mood }: { mood: Mood }) {
  if (mood === "mixed" || mood === "poor") {
    return <path d="M150 92 Q158 106 150 112 Q142 106 150 92 Z" fill="#9fe6f5" stroke="#1fc8e3" strokeWidth={2} />;
  }
  if (mood === "veryPoor") {
    return <path d="M70 138 Q76 150 70 156 Q64 150 70 138 Z" fill="#9fe6f5" stroke="#1fc8e3" strokeWidth={2} />;
  }
  if (mood === "miserable") {
    return (
      <g stroke="#9fe6f5" strokeWidth={7} strokeLinecap="round" fill="none">
        <path d="M66 128 Q60 146 62 160" />
        <path d="M134 128 Q140 146 138 160" />
      </g>
    );
  }
  return null;
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

// Three feathery gill fronds on one side of the head; mirrored for the other side.
function Gills({ side }: { side: "left" | "right" }) {
  const fronds = [
    { x: 48, y: 62, angle: -50 },
    { x: 36, y: 92, angle: -5 },
    { x: 46, y: 122, angle: 40 }
  ];
  return (
    <g transform={side === "right" ? "translate(200 0) scale(-1 1)" : undefined}>
      {fronds.map(({ x, y, angle }, index) => (
        <g key={index} transform={`translate(${x} ${y}) rotate(${angle})`}>
          <g className="animate-wiggle" style={{ animationDelay: `${index * 0.3}s` }}>
            <path d="M14 0 L-22 0" stroke="#e8357f" strokeWidth={6} strokeLinecap="round" />
            {[-20, -10].map((cx) => (
              <g key={cx}>
                <ellipse cx={cx} cy={-6} rx={4} ry={6} fill="#ff4f9a" stroke="#2b2350" strokeWidth={2} transform={`rotate(-20 ${cx} -6)`} />
                <ellipse cx={cx} cy={6} rx={4} ry={6} fill="#ff4f9a" stroke="#2b2350" strokeWidth={2} transform={`rotate(20 ${cx} 6)`} />
              </g>
            ))}
            <circle cx={-27} cy={0} r={5.5} fill="#ff4f9a" stroke="#2b2350" strokeWidth={2} />
          </g>
        </g>
      ))}
    </g>
  );
}

function CuteAxolotl({ mood }: { mood: Mood }) {
  return (
    <>
      <defs>
        <linearGradient id="axolotlSkin" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#d4f4ff" />
          <stop offset="100%" stopColor="#86d6ff" />
        </linearGradient>
      </defs>
      <ellipse cx={100} cy={192} rx={52} ry={6} fill="#2b2350" opacity={0.1} />
      <g className={mood === "sleeping" ? undefined : "animate-bob"}>
        {/* Tail */}
        <path
          d="M128 168 Q160 176 184 150 Q176 182 132 184 Z"
          fill="#a9e4ff"
          stroke={INK}
          strokeWidth={3.5}
          strokeLinejoin="round"
        />
        {/* Body, belly and little arms */}
        <ellipse cx={100} cy={162} rx={40} ry={26} fill="url(#axolotlSkin)" stroke={INK} strokeWidth={4} />
        <ellipse cx={100} cy={168} rx={22} ry={14} fill="#effbff" />
        <ellipse cx={68} cy={170} rx={9} ry={6} fill="#9fdfff" stroke={INK} strokeWidth={3} transform="rotate(-25 68 170)" />
        <ellipse cx={132} cy={170} rx={9} ry={6} fill="#9fdfff" stroke={INK} strokeWidth={3} transform="rotate(25 132 170)" />
        <Gills side="left" />
        <Gills side="right" />
        {/* Head */}
        <ellipse cx={100} cy={96} rx={60} ry={50} fill="url(#axolotlSkin)" stroke={INK} strokeWidth={4} />
        <path d="M66 62 Q76 54 90 52" stroke="#fff" strokeWidth={6} strokeLinecap="round" fill="none" opacity={0.7} />
        {/* Flower clip */}
        <g transform="translate(132 54)">
          {[0, 72, 144, 216, 288].map((angle) => (
            <ellipse key={angle} cx={0} cy={-8} rx={6} ry={8} fill="#ff8fb8" transform={`rotate(${angle})`} stroke={INK} strokeWidth={2} />
          ))}
          <circle r={5} fill="#ffc93c" stroke={INK} strokeWidth={2} />
        </g>
        <ellipse cx={58} cy={114} rx={11} ry={6.5} fill="#ff4f9a" opacity={0.5} />
        <ellipse cx={142} cy={114} rx={11} ry={6.5} fill="#ff4f9a" opacity={0.5} />
        <g transform="translate(0 -24)">
          <Eyes mood={mood} />
          <Mouth mood={mood} />
          <FaceExtras mood={mood} />
        </g>
      </g>
    </>
  );
}

function RealFace({ mood }: { mood: Mood }) {
  const line = { stroke: "#1d1838", strokeWidth: 3.5, strokeLinecap: "round" as const, fill: "none" };
  const closedEyes = mood === "excellent" || mood === "sleeping" || mood === "miserable";
  const eye = (cx: number) =>
    closedEyes ? (
      <path
        key={cx}
        d={
          mood === "excellent"
            ? `M${cx - 9} 94 Q${cx} 82 ${cx + 9} 94`
            : mood === "sleeping"
              ? `M${cx - 8} 90 Q${cx} 98 ${cx + 8} 90`
              : `M${cx - 8} 85 L${cx + 6} 91 L${cx - 8} 97`
        }
        {...line}
        transform={mood === "miserable" && cx > 100 ? `rotate(180 ${cx} 90)` : undefined}
      />
    ) : (
      <g key={cx}>
        <ellipse cx={cx} cy={91} rx={9} ry={11} fill="#1d1838" />
        <ellipse cx={cx} cy={96} rx={6.5} ry={4.5} fill="#5b4bb7" opacity={0.75} />
        <circle cx={cx - 3} cy={86.5} r={3.6} fill="#fff" />
        <circle cx={cx + 3} cy={96} r={1.8} fill="#fff" />
      </g>
    );
  const sadBrows = mood === "mixed" || mood === "poor" || mood === "veryPoor";
  const mouths: Record<Mood, ReactNode> = {
    excellent: (
      <g>
        <path d="M84 108 Q100 128 116 108 Z" fill="#d6457f" stroke="#1d1838" strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M91 117 Q100 124 109 117 Q100 113 91 117 Z" fill="#ff9cc2" />
      </g>
    ),
    good: (
      <g>
        <path d="M86 109 Q100 124 114 109 Z" fill="#d6457f" stroke="#1d1838" strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M92 116 Q100 121 108 116 Q100 113 92 116 Z" fill="#ff9cc2" />
      </g>
    ),
    okay: <path d="M86 111 Q93 118 100 112 Q107 118 114 111" {...line} />,
    mixed: <path d="M86 115 q4.7 -4 9.3 0 t9.3 0 t9.3 0" {...line} />,
    poor: <path d="M88 118 Q100 110 112 118" {...line} />,
    veryPoor: <path d="M86 120 Q100 108 114 120" {...line} />,
    miserable: <ellipse cx={100} cy={115} rx={8} ry={6.5} fill="#d6457f" stroke="#1d1838" strokeWidth={2.5} />,
    sleeping: <ellipse cx={100} cy={114} rx={3.5} ry={3} fill="#d6457f" stroke="#1d1838" strokeWidth={2} />
  };
  return (
    <g>
      {eye(72)}
      {eye(128)}
      {sadBrows ? (
        <g {...line} strokeWidth={2.5}>
          <path d="M63 77 L79 72" />
          <path d="M137 77 L121 72" />
        </g>
      ) : null}
      {mouths[mood]}
      {mood === "mixed" || mood === "poor" ? (
        <path d="M150 70 Q157 82 150 87 Q143 82 150 70 Z" fill="#c4f1fb" stroke="#1fc8e3" strokeWidth={2} />
      ) : null}
      {mood === "veryPoor" ? <path d="M66 104 Q71 114 66 119 Q61 114 66 104 Z" fill="#c4f1fb" stroke="#1fc8e3" strokeWidth={2} /> : null}
      {mood === "miserable" ? (
        <g stroke="#c4f1fb" strokeWidth={5} strokeLinecap="round" fill="none">
          <path d="M66 98 Q62 114 64 128" />
          <path d="M134 98 Q138 114 136 128" />
        </g>
      ) : null}
    </g>
  );
}

function RealAxolotl({ mood }: { mood: Mood }) {
  const OUTLINE = "#34507a";
  return (
    <>
      <defs>
        <linearGradient id="realSkin" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#dff2fc" />
          <stop offset="100%" stopColor="#8fc4e6" />
        </linearGradient>
        <linearGradient id="realFin" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#cfe9f8" stopOpacity={0.9} />
          <stop offset="100%" stopColor="#cfe9f8" stopOpacity={0.4} />
        </linearGradient>
      </defs>
      <ellipse cx={108} cy={190} rx={64} ry={6} fill="#2b2350" opacity={0.1} />
      <g className={mood === "sleeping" ? undefined : "animate-bob"}>
        {/* Tail with see-through fin */}
        <path d="M128 132 Q176 124 194 92 Q196 136 150 168 Z" fill="url(#realFin)" stroke={OUTLINE} strokeWidth={2} strokeLinejoin="round" />
        <path d="M134 144 Q170 140 190 104 Q186 140 146 164 Z" fill="url(#realSkin)" stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round" />
        {/* Body */}
        <ellipse cx={110} cy={154} rx={46} ry={27} fill="url(#realSkin)" stroke={OUTLINE} strokeWidth={2.5} />
        <ellipse cx={104} cy={160} rx={28} ry={11} fill="#eef8fd" opacity={0.8} />
        {/* Legs with little toes */}
        {[
          { x: 70, y: 168, angle: 20 },
          { x: 120, y: 174, angle: -10 },
          { x: 150, y: 166, angle: -30 }
        ].map(({ x, y, angle }) => (
          <g key={x} transform={`translate(${x} ${y}) rotate(${angle})`}>
            <path d="M0 -10 Q-2 0 -1 6" stroke={OUTLINE} strokeWidth={14} strokeLinecap="round" fill="none" />
            <path d="M0 -10 Q-2 0 -1 6" stroke="#b5dbf1" strokeWidth={10.5} strokeLinecap="round" fill="none" />
            {[-7, -2.3, 2.4, 7].map((toe) => (
              <circle key={toe} cx={toe - 1} cy={12} r={3} fill="#b5dbf1" stroke={OUTLINE} strokeWidth={1.5} />
            ))}
          </g>
        ))}
        {/* Broad, flat head */}
        <path
          d="M100 50 C140 50 158 70 158 96 C158 124 134 138 100 138 C66 138 42 124 42 96 C42 70 60 50 100 50 Z"
          fill="url(#realSkin)"
          stroke={OUTLINE}
          strokeWidth={2.5}
        />
        <path d="M66 64 Q80 58 96 58" stroke="#fff" strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.6} />
        {/* Speckles */}
        {[
          [84, 70],
          [118, 66],
          [146, 84],
          [52, 104],
          [124, 144],
          [96, 140],
          [142, 152]
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.8} fill="#4d6f9c" opacity={0.35} />
        ))}
        {/* Flower clip */}
        <g transform="translate(130 58) scale(0.85)">
          {[0, 72, 144, 216, 288].map((angle) => (
            <ellipse key={angle} cx={0} cy={-8} rx={6} ry={8} fill="#ff8fb8" transform={`rotate(${angle})`} stroke={OUTLINE} strokeWidth={2} />
          ))}
          <circle r={5} fill="#ffc93c" stroke={OUTLINE} strokeWidth={2} />
        </g>
        <ellipse cx={58} cy={110} rx={10} ry={6} fill="#ff7aa8" opacity={0.55} />
        <ellipse cx={142} cy={110} rx={10} ry={6} fill="#ff7aa8" opacity={0.55} />
        <RealFace mood={mood} />
      </g>
    </>
  );
}

export function DawnFace({
  score,
  closed = false,
  variant = "realistic"
}: {
  score: number;
  closed?: boolean;
  variant?: "cute" | "realistic";
}) {
  const mood = pickMood(score, closed);
  const { label, tint } = MOODS[mood];

  return (
    <div
      className="relative flex aspect-square w-full max-w-[320px] flex-col items-center justify-center overflow-hidden rounded-[32px] border-[3px] border-white sticker"
      style={{ background: `linear-gradient(160deg, ${tint[0]}, ${tint[1]})` }}
    >
      <svg viewBox="0 0 200 200" role="img" aria-label={`Izzy the axolotl: ${label}`} className="h-[78%] w-[78%]">
        {variant === "cute" ? <CuteAxolotl mood={mood} /> : <RealAxolotl mood={mood} />}
        <Extras mood={mood} />
      </svg>
      <p className="-mt-1 rounded-full bg-white/85 px-4 py-1 font-display text-lg font-semibold text-[var(--text)] sticker">{label}</p>
    </div>
  );
}
