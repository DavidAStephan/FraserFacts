"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { ScoreMode, ScoringWeights } from "@/lib/types";

type Props = {
  open: boolean;
  onToggle: () => void;
  mode: ScoreMode;
  onModeChange: (mode: ScoreMode) => void;
  // Importance points per factor (0-50). Their share of the total is the factor's weight.
  weights: ScoringWeights;
  onWeightChange: (key: keyof ScoringWeights, value: number) => void;
  onReset: () => void;
  previewScore?: number;
  previewBestWindow?: string;
};

const FACTORS: Array<{ key: keyof ScoringWeights; emoji: string; label: string; help: string }> = [
  { key: "pollution", emoji: "🧪", label: "Pollution", help: "Beachwatch pollution forecast" },
  { key: "rainfall", emoji: "🌧️", label: "Recent rain", help: "Rain in the last 3 days" },
  { key: "weather", emoji: "☀️", label: "Weather", help: "Air temperature and sunshine" },
  { key: "wind", emoji: "💨", label: "Wind", help: "Calmer scores higher" },
  { key: "tide", emoji: "🌊", label: "Tide", help: "Lower tide scores higher" },
  { key: "sunlight", emoji: "🌞", label: "Sun on the baths", help: "Direct sun on the pool" },
  { key: "waterPolo", emoji: "🤽", label: "Water polo", help: "Club sessions using the pool" },
  { key: "waterTemp", emoji: "🌡️", label: "Water temperature", help: "Warmer water scores higher" }
];

export const MAX_WEIGHT_POINTS = 50;

export function WeightSettings({
  open,
  onToggle,
  mode,
  onModeChange,
  weights,
  onWeightChange,
  onReset,
  previewScore,
  previewBestWindow
}: Props) {
  const total = FACTORS.reduce((sum, { key }) => sum + weights[key], 0);

  return (
    <div className="flex items-center justify-end">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="sticker inline-flex items-center gap-2 rounded-full border-2 border-[var(--line)] bg-white px-4 py-2 text-sm font-bold text-[var(--text)] transition hover:-translate-y-0.5"
      >
        <SlidersHorizontal className="h-4 w-4" />
        Tune the score
      </button>
      {open ? (
        <div className="fixed inset-x-4 top-20 z-30 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-[28px] border-[3px] border-[var(--line)] bg-white/95 p-5 shadow-2xl backdrop-blur md:absolute md:inset-x-auto md:right-0 md:top-14 md:w-[26rem]">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--accent)]">Scoring weights</p>
              <h3 className="font-display text-2xl font-semibold">Tune the score</h3>
              <p className="mt-1 text-sm leading-5 text-[var(--muted)]">Slide a factor up if it matters more to you. Slide it to zero to ignore it.</p>
            </div>
            <button
              type="button"
              onClick={onToggle}
              aria-label="Close"
              className="rounded-full bg-[#ffe1ef] p-2 text-[var(--accent)] transition hover:bg-[#ffc4de]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {previewScore !== undefined ? (
            <div className="mb-4 flex items-center justify-between rounded-2xl border-2 border-[#ffe08a] bg-[linear-gradient(160deg,#fff8dc,#ffe9f3)] px-4 py-2">
              <span className="text-sm font-bold text-[var(--muted)]">With these weights</span>
              <span className="text-right">
                <span className="font-display text-2xl font-bold text-[var(--accent)]">{previewScore.toFixed(1)}</span>
                <span className="text-sm text-[var(--muted)]"> /10 now</span>
                {previewBestWindow ? <span className="block text-xs font-semibold text-[#c98a00]">Best: {previewBestWindow}</span> : null}
              </span>
            </div>
          ) : null}

          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--muted)]">Start from</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {(["strict", "balanced"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onModeChange(item)}
                className={`rounded-full px-3 py-2 text-sm font-bold ${
                  mode === item ? "bg-[var(--accent)] text-white" : "bg-[#f3eefc] text-[#7457e8]"
                }`}
              >
                {item === "strict" ? "Strict water quality" : "Balanced"}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {FACTORS.map(({ key, emoji, label, help }) => {
              const share = total > 0 ? Math.round((weights[key] / total) * 100) : 0;
              return (
                <label key={key} className="block rounded-2xl bg-[#fbf8ff] px-3 py-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      <span className="mr-1.5" aria-hidden="true">
                        {emoji}
                      </span>
                      <span className="font-bold">{label}</span>
                      <span className="block pl-6 text-xs text-[var(--muted)]">{help}</span>
                    </span>
                    <span
                      className={`min-w-[3.25rem] rounded-full px-2 py-0.5 text-center text-xs font-bold ${
                        weights[key] === 0 ? "bg-slate-100 text-slate-500" : "bg-[#ffe1ef] text-[var(--accent)]"
                      }`}
                    >
                      {weights[key] === 0 ? "Off" : `${share}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={MAX_WEIGHT_POINTS}
                    step="1"
                    value={weights[key]}
                    aria-label={`${label} importance`}
                    onChange={(event) => onWeightChange(key, Number(event.target.value))}
                    className="mt-1 w-full accent-[var(--accent)]"
                  />
                </label>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs leading-5 text-[var(--muted)]">Saved in this browser only. Nobody else&apos;s view changes.</p>
            <button
              type="button"
              onClick={onReset}
              className="shrink-0 rounded-full border-2 border-[var(--line)] px-3 py-1.5 text-sm font-bold text-[var(--accent)]"
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
