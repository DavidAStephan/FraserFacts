"use client";

import { SlidersHorizontal } from "lucide-react";
import { ScoreMode, ScoringWeights } from "@/lib/types";

type Props = {
  open: boolean;
  onToggle: () => void;
  mode: ScoreMode;
  onModeChange: (mode: ScoreMode) => void;
  weights: ScoringWeights;
  onWeightChange: (key: keyof ScoringWeights, value: number) => void;
  onReset: () => void;
};

const LABELS: Record<keyof ScoringWeights, string> = {
  pollution: "Pollution",
  rainfall: "Rainfall",
  weather: "Weather",
  wind: "Wind",
  tide: "Tide",
  sunlight: "Sunlight",
  waterPolo: "Water polo",
  waterTemp: "Water temp"
};

export function WeightSettings({
  open,
  onToggle,
  mode,
  onModeChange,
  weights,
  onWeightChange,
  onReset
}: Props) {
  return (
    <div className="flex items-center justify-end">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white"
      >
        <SlidersHorizontal className="h-4 w-4" />
        Settings
      </button>
      {open ? (
        <div className="absolute right-0 top-14 z-20 w-full max-w-md rounded-[28px] border border-[var(--line)] bg-white/95 p-5 shadow-2xl backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-[var(--muted)]">Scoring</p>
              <h3 className="font-[var(--font-display)] text-2xl">Local tuning</h3>
            </div>
            <button type="button" onClick={onReset} className="text-sm font-semibold text-[var(--accent)]">
              Reset
            </button>
          </div>
          <div className="mb-4 flex gap-2">
            {(["strict", "balanced"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onModeChange(item)}
                className={`rounded-full px-3 py-2 text-sm font-semibold ${
                  mode === item ? "bg-[var(--accent)] text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                {item === "strict" ? "Strict water quality" : "Balanced"}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {(Object.keys(weights) as Array<keyof ScoringWeights>).map((key) => (
              <label key={key} className="block">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span>{LABELS[key]}</span>
                  <span className="font-semibold">{weights[key].toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.02"
                  max="0.4"
                  step="0.01"
                  value={weights[key]}
                  onChange={(event) => onWeightChange(key, Number(event.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </label>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
            These changes stay in your browser via localStorage. They only affect your local dashboard.
          </p>
        </div>
      ) : null}
    </div>
  );
}
