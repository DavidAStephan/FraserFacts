"use client";

import { useState } from "react";
import { Sun } from "lucide-react";
import { HourlyCondition } from "@/lib/types";
import { formatSydneyTime, sydneyParts } from "@/lib/utils";

// WHO / Bureau of Meteorology UV categories. Colour always appears with the category name.
const CATEGORIES = [
  { min: 11, label: "Extreme", color: "#9b5cd6" },
  { min: 8, label: "Very high", color: "#e5484d" },
  { min: 6, label: "High", color: "#f08a24" },
  { min: 3, label: "Moderate", color: "#e8b400" },
  { min: 0, label: "Low", color: "#4cb84c" }
] as const;

const PROTECTION_THRESHOLD = 3;
const FIRST_HOUR = 6;
const LAST_HOUR = 19;

function uvCategory(uv: number) {
  return CATEGORIES.find((category) => uv >= category.min) ?? CATEGORIES[CATEGORIES.length - 1];
}

function roundUv(uv: number) {
  return Math.round(uv * 10) / 10;
}

const TIPS: Record<string, string> = {
  Low: "UV is low today, but sunscreen is still a good idea for a long swim.",
  Moderate: "Slip on a shirt, slop on SPF50+, slap on a hat, seek shade and slide on sunnies during protection times.",
  High: "Slip, slop, slap, seek and slide! Reapply sunscreen after swimming and take shade breaks.",
  "Very high": "Very strong sun: swim early or late if you can, and reapply SPF50+ after every swim.",
  Extreme: "Extreme UV: avoid the middle of the day, cover up and stay in the shade between swims."
};

export function UvCard({ timeline, currentIsoTime }: { timeline: HourlyCondition[]; currentIsoTime: string }) {
  const [activeIso, setActiveIso] = useState<string | null>(null);
  const hours = timeline.filter((hour) => {
    const { hour: h } = sydneyParts(new Date(hour.isoTime));
    return h >= FIRST_HOUR && h <= LAST_HOUR && typeof hour.uvIndex === "number";
  });

  if (!hours.length) {
    return null;
  }

  const current = timeline.find((hour) => hour.isoTime === currentIsoTime);
  const currentUv = typeof current?.uvIndex === "number" ? roundUv(current.uvIndex) : undefined;
  const peak = hours.reduce((best, hour) => ((hour.uvIndex ?? 0) > (best.uvIndex ?? 0) ? hour : best), hours[0]);
  const peakUv = roundUv(peak.uvIndex ?? 0);
  const peakCategory = uvCategory(peakUv);
  // Scale to the day's peak (at least UV 6) so the shape of the day is easy to read.
  const chartMax = Math.max(6, Math.ceil(peakUv) + 1);
  const protectedHours = hours.filter((hour) => (hour.uvIndex ?? 0) >= PROTECTION_THRESHOLD);
  const protectionWindow = protectedHours.length
    ? `${formatSydneyTime(protectedHours[0].isoTime)} - ${formatSydneyTime(
        new Date(new Date(protectedHours[protectedHours.length - 1].isoTime).getTime() + 60 * 60 * 1000).toISOString()
      )}`
    : null;
  const active = hours.find((hour) => hour.isoTime === activeIso);
  const readout = active ?? current ?? peak;
  const readoutUv = roundUv(readout.uvIndex ?? 0);

  return (
    <section className="card mb-8 rounded-[32px] p-6 md:p-7" style={{ borderColor: "#ffe08a" }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-12 w-12 shrink-0 -rotate-6 items-center justify-center rounded-2xl bg-[#fff3c7] text-[#c98a00] sticker">
            <Sun className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-[#c98a00]">UV index today</p>
            <h2 className="font-display text-3xl">
              <span className="marker">Sun safety</span>
            </h2>
          </div>
        </div>
        <p className="max-w-md text-sm leading-6 text-[var(--muted)]">{TIPS[peakCategory.label]}</p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat
          label="UV now"
          value={currentUv !== undefined ? String(currentUv) : "-"}
          category={currentUv !== undefined ? uvCategory(currentUv) : undefined}
        />
        <Stat label={`Peak at ${formatSydneyTime(peak.isoTime)}`} value={String(peakUv)} category={peakCategory} />
        <div className="rounded-[24px] border-[3px] border-[#ffe08a] bg-[linear-gradient(160deg,#fff8dc,#ffe9f3)] p-4">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#c98a00]">Sun protection times</p>
          <p className="mt-2 font-display text-2xl font-semibold text-[var(--text)]">{protectionWindow ?? "Not needed"}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">When UV is 3 or above</p>
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm text-[var(--muted)]" aria-live="polite">
          <span className="font-bold text-[var(--text)]">{formatSydneyTime(readout.isoTime)}</span>: UV {readoutUv} ({uvCategory(readoutUv).label})
          {!active && readout === current ? " now" : ""}
        </p>
        <div className="relative h-40" onMouseLeave={() => setActiveIso(null)}>
          {/* Protection threshold line at UV 3 */}
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-[#e8dcc0]"
            style={{ bottom: `${(PROTECTION_THRESHOLD / chartMax) * 100}%` }}
          >
            <span className="absolute -top-5 right-0 text-[11px] text-[var(--muted)]">UV 3: protection needed above</span>
          </div>
          <div className="absolute inset-0 flex items-end gap-[2px] border-b border-[#e8dcc0]">
            {hours.map((hour) => {
              const uv = hour.uvIndex ?? 0;
              const category = uvCategory(uv);
              const isCurrent = hour.isoTime === currentIsoTime;
              const isPeak = hour.isoTime === peak.isoTime;
              return (
                <button
                  key={hour.isoTime}
                  type="button"
                  aria-label={`${formatSydneyTime(hour.isoTime)}: UV ${roundUv(uv)}, ${category.label}`}
                  onMouseEnter={() => setActiveIso(hour.isoTime)}
                  onFocus={() => setActiveIso(hour.isoTime)}
                  onBlur={() => setActiveIso(null)}
                  className="group relative flex h-full flex-1 items-end justify-center outline-none"
                >
                  {isPeak ? (
                    <span
                      className="absolute text-xs font-bold text-[var(--text)]"
                      style={{ bottom: `calc(${(Math.min(uv, chartMax) / chartMax) * 100}% + 4px)` }}
                    >
                      {roundUv(uv)}
                    </span>
                  ) : null}
                  <span
                    className={`block w-full max-w-[24px] rounded-t-[4px] transition-opacity group-hover:opacity-80 group-focus-visible:ring-2 group-focus-visible:ring-[var(--accent)] ${
                      isCurrent ? "ring-2 ring-[var(--text)] ring-offset-2" : ""
                    }`}
                    style={{ height: `${Math.max((Math.min(uv, chartMax) / chartMax) * 100, uv > 0 ? 2 : 0)}%`, background: category.color }}
                  />
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-1 flex gap-[2px] text-[11px] text-[var(--muted)]">
          {hours.map((hour) => {
            const { hour: h } = sydneyParts(new Date(hour.isoTime));
            return (
              <span key={hour.isoTime} className="flex-1 text-center">
                {h % 3 === 0 ? formatSydneyTime(hour.isoTime).replace(":00", "") : ""}
              </span>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
          {[...CATEGORIES].reverse().map((category) => (
            <span key={category.label} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: category.color }} />
              {category.label} {category.min === 0 ? "0-2" : category.min === 11 ? "11+" : `${category.min}-${category.min === 3 ? 5 : category.min === 6 ? 7 : 10}`}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm ring-2 ring-[var(--text)] ring-offset-1" /> Now
          </span>
        </div>
        <details className="mt-3 text-sm text-[var(--muted)]">
          <summary className="cursor-pointer font-semibold text-[var(--accent)]">Show hourly UV numbers</summary>
          <table className="mt-2 w-full max-w-sm text-left">
            <thead>
              <tr>
                <th className="py-1 font-semibold">Time</th>
                <th className="py-1 font-semibold">UV</th>
                <th className="py-1 font-semibold">Category</th>
              </tr>
            </thead>
            <tbody>
              {hours.map((hour) => (
                <tr key={hour.isoTime}>
                  <td className="py-0.5">{formatSydneyTime(hour.isoTime)}</td>
                  <td className="py-0.5">{roundUv(hour.uvIndex ?? 0)}</td>
                  <td className="py-0.5">{uvCategory(hour.uvIndex ?? 0).label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Forecast UV from Open-Meteo. For official real-time readings see{" "}
          <a href="https://www.arpansa.gov.au/our-services/monitoring/ultraviolet-radiation-monitoring/ultraviolet-radiation-index" target="_blank" rel="noreferrer" className="font-semibold text-[var(--accent)] underline">
            ARPANSA
          </a>
          .
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value, category }: { label: string; value: string; category?: (typeof CATEGORIES)[number] }) {
  return (
    <div className="rounded-[24px] border-[3px] border-[#ffe08a] bg-white/80 p-4">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#c98a00]">{label}</p>
      <div className="mt-2 flex items-center gap-3">
        <span className="font-display text-4xl font-semibold text-[var(--text)]">{value}</span>
        {category ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fbf8ff] px-2.5 py-1 text-sm font-bold text-[var(--text)]">
            <span className="h-3 w-3 rounded-full" style={{ background: category.color }} />
            {category.label}
          </span>
        ) : null}
      </div>
    </div>
  );
}
