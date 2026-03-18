import clsx from "clsx";
import { ConfidenceLevel } from "@/lib/types";

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function toOneDecimal(value: number | undefined | null) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

export function average(values: Array<number | undefined | null>) {
  const filtered = values.filter((value): value is number => typeof value === "number" && !Number.isNaN(value));
  if (!filtered.length) {
    return 0;
  }
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

export function confidenceLevel(value: number): ConfidenceLevel {
  if (value >= 0.75) return "high";
  if (value >= 0.45) return "medium";
  return "low";
}

export function confidenceTone(level: ConfidenceLevel) {
  return clsx(
    "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
    level === "high" && "border-emerald-200 bg-emerald-50 text-emerald-700",
    level === "medium" && "border-amber-200 bg-amber-50 text-amber-700",
    level === "low" && "border-rose-200 bg-rose-50 text-rose-700"
  );
}

export function formatSydneyTime(iso: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "numeric",
    minute: "2-digit",
    ...options
  }).format(new Date(iso));
}

export function formatSydneyDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

export function formatWindow(startIso: string, endIso: string) {
  return `${formatSydneyTime(startIso)}-${formatSydneyTime(endIso)}`;
}

export function windDirectionLabel(degrees?: number) {
  if (degrees === undefined || Number.isNaN(degrees)) return "Unknown";
  const labels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return labels[Math.round(degrees / 45) % 8];
}

export function weatherCodeLabel(code?: number) {
  if (code === undefined) return "Unknown";
  if ([0].includes(code)) return "Clear";
  if ([1, 2].includes(code)) return "Mostly clear";
  if (code === 3) return "Cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunder";
  return "Mixed";
}
