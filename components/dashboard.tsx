"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CloudSun,
  Droplets,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Thermometer,
  Waves,
  Wind
} from "lucide-react";
import { AggregatedResponse, MetricConfidence, ScoreMode, ScoringWeights } from "@/lib/types";
import { DEFAULT_WEIGHTS, explainBestTime, recommendationLabel, scoreTimeline } from "@/lib/scoring";
import { average, confidenceLevel, formatSydneyDateTime, formatWindow, toOneDecimal, windDirectionLabel } from "@/lib/utils";
import { ConfidencePill } from "@/components/confidence-pill";
import { DawnFace } from "@/components/dawn-face";
import { HourlyChart } from "@/components/hourly-chart";
import { WeightSettings } from "@/components/weight-settings";

const STORAGE_KEY = "fraser-facts-settings-v1";

function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, value / total])
  ) as ScoringWeights;
}

function factorCard(
  title: string,
  value: string,
  subtitle: string,
  confidence: MetricConfidence,
  icon: ReactNode
) {
  return (
    <article className="card rounded-[28px] p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-[var(--accent)]">
          {icon}
        </div>
        <ConfidencePill confidence={confidence} />
      </div>
      <p className="text-sm uppercase tracking-[0.22em] text-[var(--muted)]">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{value}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{subtitle}</p>
    </article>
  );
}

export function Dashboard() {
  const [data, setData] = useState<AggregatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mode, setMode] = useState<ScoreMode>("balanced");
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS.balanced);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { mode?: ScoreMode; weights?: Partial<Record<ScoreMode, ScoringWeights>> };
      if (parsed.mode) setMode(parsed.mode);
      if (parsed.weights?.[parsed.mode ?? "balanced"]) {
        setWeights(parsed.weights[parsed.mode ?? "balanced"] as ScoringWeights);
      }
    } catch {
      // Ignore malformed local settings.
    }
  }, []);

  async function load(nextMode = mode) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/conditions?mode=${nextMode}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Failed to load conditions");
      }
      const payload = (await response.json()) as AggregatedResponse;
      setData(payload);
      setMode(nextMode);
      setWeights((current) => {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as { weights?: Partial<Record<ScoreMode, ScoringWeights>> };
            const next = parsed.weights?.[nextMode];
            if (next) return normalizeWeights(next);
          } catch {
            return current;
          }
        }
        return payload.defaultWeights[nextMode];
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const existing = window.localStorage.getItem(STORAGE_KEY);
      const parsed = existing ? (JSON.parse(existing) as { weights?: Partial<Record<ScoreMode, ScoringWeights>> }) : {};
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mode,
          weights: {
            ...(parsed.weights ?? {}),
            [mode]: weights
          }
        })
      );
    } catch {
      // localStorage unavailable
    }
  }, [mode, weights]);

  const derived = useMemo(() => {
    if (!data) return null;
    const normalizedWeights = normalizeWeights(weights);
    const scored = scoreTimeline(data.timeline, normalizedWeights);
    const current = scored.find((hour) => hour.isoTime === data.current.isoTime) ?? scored[0];
    const currentIndex = scored.findIndex((hour) => hour.isoTime === current.isoTime);
    const remaining = scored.slice(currentIndex);
    const best = remaining.reduce((candidate, hour) => (hour.score > candidate.score ? hour : candidate), remaining[0]);
    const bestIndex = remaining.findIndex((hour) => hour.isoTime === best.isoTime);
    return {
      current,
      best,
      bestWindow: formatWindow(best.isoTime, remaining[Math.min(remaining.length - 1, bestIndex + 1)].isoTime),
      recommendation: recommendationLabel(current.score),
      bestReason: explainBestTime(current, best),
      currentConfidence: {
        ...data.confidences.current,
        value: average([current.confidence, data.confidences.current.value]),
        level: confidenceLevel(average([current.confidence, data.confidences.current.value]))
      } as MetricConfidence,
      bestConfidence: {
        ...data.confidences.best,
        value: average([best.confidence, data.confidences.best.value]),
        level: confidenceLevel(average([best.confidence, data.confidences.best.value]))
      } as MetricConfidence
    };
  }, [data, weights]);

  function updateWeight(key: keyof ScoringWeights, value: number) {
    setWeights((current) => normalizeWeights({ ...current, [key]: value }));
  }

  function resetWeights() {
    setWeights(DEFAULT_WEIGHTS[mode]);
  }

  if (loading && !data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6 py-20">
        <div className="card card-strong rounded-[32px] px-8 py-10 text-center">
          <p className="text-sm uppercase tracking-[0.28em] text-[var(--muted)]">Fraser Facts</p>
          <h1 className="mt-3 font-[var(--font-display)] text-4xl">Loading live swim conditions</h1>
          <p className="mt-4 text-[var(--muted)]">Fetching Beachwatch, weather, marine, tide, and local schedule data.</p>
        </div>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6 py-20">
        <div className="card card-strong rounded-[32px] p-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-700">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="mt-4 font-[var(--font-display)] text-4xl">Fraser Facts couldn&apos;t load conditions</h1>
          <p className="mt-3 text-[var(--muted)]">{error}</p>
          <button
            type="button"
            onClick={() => void load(mode)}
            className="mt-6 rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!data || !derived) {
    return null;
  }

  const current = derived.current;
  const best = derived.best;
  const weatherNow = `${current.weatherLabel}${current.airTempC !== undefined ? `, ${toOneDecimal(current.airTempC)}°C` : ""}`;
  const tideNow = current.tideHeightM !== undefined ? `${toOneDecimal(current.tideHeightM)} m, ${current.tideState}` : "Unknown";
  const uvText = current.uvIndex !== undefined ? `${toOneDecimal(current.uvIndex)}` : "Unknown";
  const bestUvText = best.uvIndex !== undefined ? `${toOneDecimal(best.uvIndex)}` : "Unknown";

  return (
    <main className="mx-auto max-w-7xl px-5 py-6 md:px-8 md:py-8">
      <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.36em] text-[var(--muted)]">Balmain swim dashboard</p>
          <h1 className="mt-2 font-[var(--font-display)] text-5xl leading-none md:text-6xl">Fraser Facts</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Live local-only advice for Dawn Fraser Baths using Beachwatch water-quality context, weather, tides, marine
            temperature, rainfall drag, direct sun heuristics, and a local water polo schedule.
          </p>
        </div>
        <div className="relative flex items-center gap-3 self-start">
          <button
            type="button"
            onClick={() => void load(mode)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh data
          </button>
          <WeightSettings
            open={drawerOpen}
            onToggle={() => setDrawerOpen((value) => !value)}
            mode={mode}
            onModeChange={(nextMode) => {
              setMode(nextMode);
              void load(nextMode);
            }}
            weights={weights}
            onWeightChange={updateWeight}
            onReset={resetWeights}
          />
        </div>
      </header>

      <section className="hero-grid mb-8">
        <div className="card card-strong rounded-[36px] p-6 md:p-8">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <ConfidencePill confidence={derived.currentConfidence} />
            <ConfidencePill confidence={derived.bestConfidence} />
            <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              {mode === "strict" ? "Strict water-quality mode" : "Balanced mode"}
            </span>
          </div>
          <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-[var(--muted)]">Current score</p>
              <div className="mt-3 flex items-end gap-4">
                <span className="font-[var(--font-display)] text-7xl leading-none">{current.score.toFixed(1)}</span>
                <span className="pb-2 text-xl text-[var(--muted)]">/10</span>
              </div>
              <p className="mt-4 inline-flex rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">
                {derived.recommendation}
              </p>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--muted)]">{current.summary}</p>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-[24px] border border-[var(--line)] bg-white/60 p-4">
                  <p className="text-sm uppercase tracking-[0.22em] text-[var(--muted)]">Best time today</p>
                  <p className="mt-2 text-4xl font-semibold">{best.score.toFixed(1)} / 10</p>
                  <p className="mt-2 text-sm font-semibold text-[var(--accent)]">{derived.bestWindow}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{derived.bestReason}</p>
                </div>
                <div className="rounded-[24px] border border-[var(--line)] bg-white/60 p-4">
                  <p className="text-sm uppercase tracking-[0.22em] text-[var(--muted)]">Right now</p>
                  <p className="mt-2 text-lg font-semibold">{weatherNow}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    Tide {tideNow}. UV {uvText} now and {bestUvText} near the best window.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-[32px] border border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.7),rgba(211,231,236,0.62))] p-5">
              <p className="text-center text-sm uppercase tracking-[0.24em] text-[var(--muted)]">Dawn Fraser mood</p>
              <div className="mt-4 flex justify-center">
                <DawnFace score={current.score} />
              </div>
            </div>
          </div>
        </div>

        <aside className="card rounded-[36px] p-6 md:p-8">
          <p className="text-sm uppercase tracking-[0.24em] text-[var(--muted)]">Hourly outlook</p>
          <h2 className="mt-3 font-[var(--font-display)] text-3xl">Score trend across the rest of today</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            The sparkline re-scores each hour using your local weight settings, so you can push the model harder on
            water quality or balance it toward comfort.
          </p>
          <div className="mt-6">
            <HourlyChart timeline={data.timeline} weights={weights} mode={mode} />
          </div>
          <div className="mt-4 grid gap-3">
            {scoreTimeline(data.timeline, weights)
              .filter((hour) => new Date(hour.isoTime) >= new Date(current.isoTime))
              .slice(0, 5)
              .map((hour) => (
                <div key={hour.isoTime} className="flex items-center justify-between rounded-2xl bg-white/60 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">{hour.label}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {hour.weatherLabel}, {hour.sunlightLabel.toLowerCase()}
                    </p>
                  </div>
                  <p className="text-lg font-semibold text-[var(--accent)]">{hour.score.toFixed(1)}</p>
                </div>
              ))}
          </div>
        </aside>
      </section>

      <section className="metric-grid mb-8">
        {factorCard(
          "Pollution risk",
          current.pollutionSummary,
          "Beachwatch carries the strongest scoring weight because pollution and water quality are your primary concern.",
          data.confidences.pollution,
          <ShieldCheck className="h-5 w-5" />
        )}
        {factorCard(
          "Recent rainfall",
          `${toOneDecimal(current.rainfallLast24hMm) ?? "Unknown"} mm / 24h`,
          `48h ${toOneDecimal(current.rainfallLast48hMm) ?? "?"} mm, 72h ${toOneDecimal(current.rainfallLast72hMm) ?? "?"} mm`,
          data.confidences.rainfall,
          <CloudSun className="h-5 w-5" />
        )}
        {factorCard(
          "Weather",
          weatherNow,
          `Cloud cover ${toOneDecimal(current.cloudCoverPct) ?? "?"}% and UV ${uvText}. Best window UV ${bestUvText}.`,
          data.confidences.weather,
          <Thermometer className="h-5 w-5" />
        )}
        {factorCard(
          "Wind",
          current.windSpeedKph !== undefined ? `${toOneDecimal(current.windSpeedKph)} km/h ${windDirectionLabel(current.windDirectionDeg)}` : "Unknown",
          "Lower wind helps comfort and water surface quality.",
          data.confidences.weather,
          <Wind className="h-5 w-5" />
        )}
        {factorCard(
          "Water temperature",
          current.waterTempC !== undefined ? `${toOneDecimal(current.waterTempC)}°C` : "Unknown",
          "Nearest marine grid estimate for Sydney Harbour water near the baths.",
          data.confidences.marine,
          <Droplets className="h-5 w-5" />
        )}
        {factorCard(
          "Tide",
          tideNow,
          "Lower tide scores better in this model. Falling or low tide gets a modest boost.",
          data.confidences.tides,
          <Waves className="h-5 w-5" />
        )}
        {factorCard(
          "Sun on the baths",
          current.sunlightLabel,
          "Heuristic from the sun angle plus a west-leaning orientation assumption for Dawn Fraser Baths.",
          {
            label: "Sunlight",
            value: 0.58,
            level: "medium",
            note: "Directional heuristic rather than site-specific geometry."
          },
          <Gauge className="h-5 w-5" />
        )}
        {factorCard(
          "Water polo",
          current.waterPoloActive === null ? "Unknown" : current.waterPoloActive ? "On" : "Not on",
          current.waterPoloNote,
          data.confidences.waterPolo,
          <ArrowUpRight className="h-5 w-5" />
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="card rounded-[32px] p-6 md:p-7">
          <p className="text-sm uppercase tracking-[0.24em] text-[var(--muted)]">Why the score looks like this</p>
          <h2 className="mt-3 font-[var(--font-display)] text-3xl">Transparent scoring</h2>
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
            Each factor is normalized to a 0-1 preference score, then combined as a weighted sum out of 10. UV is
            displayed prominently but is not a major penalty on its own.
          </p>
          <div className="mt-6 space-y-3">
            {current.scoreBreakdown.map((item) => (
              <div key={item.key} className="rounded-2xl bg-white/60 p-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-semibold capitalize">{item.key}</span>
                  <span className="text-[var(--muted)]">
                    weight {item.weight.toFixed(2)} • contribution {item.contribution.toFixed(2)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${item.normalized * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="card rounded-[32px] p-6 md:p-7">
          <p className="text-sm uppercase tracking-[0.24em] text-[var(--muted)]">Advisory notes</p>
          <h2 className="mt-3 font-[var(--font-display)] text-3xl">Assumptions and sources</h2>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-[var(--muted)]">
            {data.assumptions.map((assumption) => (
              <li key={assumption} className="rounded-2xl bg-white/60 px-4 py-3">
                {assumption}
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50/90 p-4 text-sm leading-6 text-amber-900">
            Advisory only. This dashboard is a local decision aid, not a health or safety guarantee. Always use your
            judgment and official site notices before swimming.
          </div>
        </article>
      </section>

      <section className="mt-8 card rounded-[32px] p-6 md:p-7">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-[var(--muted)]">Sources</p>
            <h2 className="mt-2 font-[var(--font-display)] text-3xl">Last updated and provenance</h2>
          </div>
          <p className="text-sm text-[var(--muted)]">Dashboard refresh: {formatSydneyDateTime(data.fetchedAt)}</p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {data.sources.map((source) => (
            <a
              key={`${source.name}-${source.url}`}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-[24px] border border-[var(--line)] bg-white/60 p-4 transition hover:bg-white"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{source.name}</p>
                <ArrowUpRight className="h-4 w-4 text-[var(--accent)]" />
              </div>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                {source.lastUpdated ? formatSydneyDateTime(source.lastUpdated) : "Timestamp not supplied"}
              </p>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{source.note}</p>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
