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
import { DEFAULT_WEIGHTS, explainBestTime, findBestWindow, recommendationLabel, scoreTimeline } from "@/lib/scoring";
import { average, confidenceLevel, formatSydneyDateTime, toOneDecimal, windDirectionLabel } from "@/lib/utils";
import { ConfidencePill } from "@/components/confidence-pill";
import { DawnFace } from "@/components/dawn-face";
import { HourlyChart } from "@/components/hourly-chart";
import { WeightSettings } from "@/components/weight-settings";
import { Sakura } from "@/components/sakura";

const STORAGE_KEY = "fraser-facts-settings-v1";

function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, value / total])
  ) as ScoringWeights;
}

type StoredSettings = {
  mode?: ScoreMode;
  weights?: Partial<Record<ScoreMode, Partial<ScoringWeights>>>;
};

function readSettings(): StoredSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSettings) : {};
  } catch {
    return {};
  }
}

function savedWeightsFor(mode: ScoreMode, settings: StoredSettings): ScoringWeights {
  const saved = settings.weights?.[mode];
  return saved ? normalizeWeights({ ...DEFAULT_WEIGHTS[mode], ...saved }) : DEFAULT_WEIGHTS[mode];
}

const TONES = {
  pink: { soft: "#ffe1ef", strong: "#e8357f", border: "#ffc4de" },
  aqua: { soft: "#d9f6fc", strong: "#0b9bb5", border: "#a8e8f5" },
  sunny: { soft: "#fff3c7", strong: "#c98a00", border: "#ffe08a" },
  lavender: { soft: "#ece6ff", strong: "#7457e8", border: "#d4c7ff" },
  mint: { soft: "#dcf9ec", strong: "#109865", border: "#a9eccd" },
  coral: { soft: "#ffe6dc", strong: "#e2603a", border: "#ffc6b0" }
} as const;

type Tone = keyof typeof TONES;

function factorCard(
  title: string,
  value: string,
  subtitle: string,
  confidence: MetricConfidence,
  icon: ReactNode,
  tone: Tone
) {
  const colors = TONES[tone];
  return (
    <article className="card rounded-[28px] p-5" style={{ borderColor: colors.border }}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div
          className="inline-flex h-12 w-12 shrink-0 -rotate-6 items-center justify-center rounded-2xl sticker"
          style={{ background: colors.soft, color: colors.strong }}
        >
          {icon}
        </div>
        <ConfidencePill confidence={confidence} />
      </div>
      <p className="text-sm font-extrabold uppercase tracking-[0.18em]" style={{ color: colors.strong }}>
        {title}
      </p>
      <p className="mt-2 font-display text-2xl font-semibold text-[var(--text)]">{value}</p>
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
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  async function load(nextMode = mode) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/conditions?mode=${nextMode}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Failed to load conditions");
      }
      setData((await response.json()) as AggregatedResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  // Restore saved settings before the first save, so the defaults never overwrite them.
  useEffect(() => {
    const settings = readSettings();
    const initialMode: ScoreMode = settings.mode === "strict" ? "strict" : "balanced";
    setMode(initialMode);
    setWeights(savedWeightsFor(initialMode, settings));
    setSettingsLoaded(true);
    void load(initialMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    try {
      const settings = readSettings();
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mode,
          weights: {
            ...(settings.weights ?? {}),
            [mode]: weights
          }
        })
      );
    } catch {
      // localStorage unavailable
    }
  }, [settingsLoaded, mode, weights]);

  const derived = useMemo(() => {
    if (!data) return null;
    const normalizedWeights = normalizeWeights(weights);
    const scored = scoreTimeline(data.timeline, normalizedWeights);
    const { current, best, bestWindow } = findBestWindow(scored, data.current.isoTime);
    return {
      scored,
      current,
      best,
      bestWindow,
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
          <h1 className="mt-3 font-display text-4xl">Loading live swim conditions</h1>
          <p className="mt-4 text-[var(--muted)]">Fetching Beachwatch, weather, marine, tide, and water polo data.</p>
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
          <h1 className="mt-4 font-display text-4xl">Fraser Facts couldn&apos;t load conditions</h1>
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
  const recommendationText = data.bathsStatus.isOpenNow ? derived.recommendation : "Closed now";

  return (
    <>
    <Sakura />
    <main className="relative z-10 mx-auto max-w-7xl px-5 py-6 md:px-8 md:py-8">
      <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.3em] text-[var(--accent)]">✦ Balmain swim dashboard ✦</p>
          <div className="mt-2 flex items-start gap-3">
            <h1 className="anime-title rainbow-text pb-2 font-display text-6xl font-bold leading-none md:text-7xl">Fraser Facts</h1>
            <span
              title="Kira kira means sparkly!"
              className="mt-1 rotate-12 rounded-full border-[3px] border-[#2b2350] bg-[#ffc93c] px-3 py-1 font-display text-sm font-bold text-[#2b2350] sticker"
            >
              キラキラ ✦
            </span>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Live advice for Dawn Fraser Baths using Beachwatch water-quality context, weather, tides, marine
            temperature, rainfall drag, direct sun heuristics, and the Balmain Water Polo calendar.
          </p>
        </div>
        <div className="relative flex items-center gap-3 self-start">
          <button
            type="button"
            onClick={() => void load(mode)}
            className="sticker inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white transition hover:-translate-y-0.5"
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
              setWeights(savedWeightsFor(nextMode, readSettings()));
              void load(nextMode);
            }}
            weights={weights}
            onWeightChange={updateWeight}
            onReset={resetWeights}
          />
        </div>
      </header>

      <section className="hero-grid mb-8">
        <div className="card card-strong overflow-hidden rounded-[36px] p-6 md:p-8">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <ConfidencePill confidence={derived.currentConfidence} />
            <ConfidencePill confidence={derived.bestConfidence} />
            <ConfidencePill confidence={data.confidences.openingHours} />
            <span className="rounded-full border-2 border-[#d4c7ff] bg-[#ece6ff] px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-[#7457e8]">
              {mode === "strict" ? "Strict water-quality mode" : "Balanced mode"}
            </span>
          </div>
          <div
            className={`mb-5 rounded-[24px] border px-4 py-3 text-sm font-semibold ${
              data.bathsStatus.isOpenNow
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {data.bathsStatus.statusLabel}: {data.bathsStatus.reason}
            {!data.bathsStatus.isOpenNow && data.bathsStatus.nextOpenWindow
              ? ` Next open today around ${data.bathsStatus.nextOpenWindow}.`
              : ""}
          </div>
          <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-[var(--accent)]">Current score</p>
              <div className="relative mt-3 flex items-end gap-4">
                <div aria-hidden="true" className="speed-lines pointer-events-none absolute -left-16 -top-24 h-72 w-72" />
                <span className="anime-title rainbow-text relative font-display text-8xl font-bold leading-none">{current.score.toFixed(1)}</span>
                <span className="pb-2 text-xl text-[var(--muted)]">/10</span>
              </div>
              <p
                className={`mt-4 inline-flex rounded-full px-4 py-2 text-sm font-semibold text-white ${
                  data.bathsStatus.isOpenNow ? "bg-[var(--accent)]" : "bg-rose-600"
                }`}
              >
                {recommendationText}
              </p>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--muted)]">{current.summary}</p>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-[24px] border-[3px] border-[#ffe08a] bg-[linear-gradient(160deg,#fff8dc,#ffe9f3)] p-4">
                  <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#c98a00]">⭐ Best time today</p>
                  <p className="mt-2 text-4xl font-semibold">{best.score.toFixed(1)} / 10</p>
                  <p className="mt-2 text-sm font-semibold text-[var(--accent)]">{derived.bestWindow}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{derived.bestReason}</p>
                </div>
                <div className="rounded-[24px] border-[3px] border-[#a8e8f5] bg-[linear-gradient(160deg,#e3f9ff,#efeaff)] p-4">
                  <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#0b9bb5]">🌊 Right now</p>
                  <p className="mt-2 text-lg font-semibold">{weatherNow}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    Tide {tideNow}. UV {uvText} now and {bestUvText} near the best window.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-[32px] border-[3px] border-[var(--line)] bg-[linear-gradient(180deg,#fff,#fff0f7)] p-5">
              <p className="text-center text-sm font-extrabold uppercase tracking-[0.2em] text-[var(--accent)]">Izzy&apos;s mood</p>
              <div className="mt-4 flex justify-center">
                <DawnFace score={current.score} closed={!data.bathsStatus.isOpenNow} />
              </div>
            </div>
          </div>
        </div>

        <aside className="card rounded-[36px] p-6 md:p-8">
          <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-[var(--accent)]">Hourly outlook</p>
          <h2 className="mt-3 font-display text-3xl"><span className="marker">Score trend across the rest of today</span></h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            The sparkline re-scores each hour using your local weight settings, so you can push the model harder on
            water quality or balance it toward comfort.
          </p>
          <div className="mt-6">
            <HourlyChart timeline={data.timeline} weights={weights} mode={mode} />
          </div>
          <div className="mt-4 grid gap-3">
            {derived.scored
              .filter((hour) => new Date(hour.isoTime) >= new Date(current.isoTime))
              .slice(0, 5)
              .map((hour) => (
                <div key={hour.isoTime} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">{hour.label}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {hour.weatherLabel}, {hour.sunlightLabel.toLowerCase()}
                    </p>
                  </div>
                  <p className="rounded-full bg-[#ffe1ef] px-3 py-0.5 font-display text-lg font-semibold text-[var(--accent)]">
                    {hour.score.toFixed(1)}
                  </p>
                </div>
              ))}
          </div>
        </aside>
      </section>

      <section className="metric-grid mb-8">
        {factorCard(
          "Baths status",
          data.bathsStatus.statusLabel,
          data.bathsStatus.reason,
          data.confidences.openingHours,
          <AlertTriangle className="h-5 w-5" />,
          "coral"
        )}
        {factorCard(
          "Pollution risk",
          current.pollutionSummary,
          "Beachwatch carries the strongest scoring weight because pollution and water quality are your primary concern.",
          data.confidences.pollution,
          <ShieldCheck className="h-5 w-5" />,
          "mint"
        )}
        {factorCard(
          "Recent rainfall",
          `${toOneDecimal(current.rainfallLast24hMm) ?? "Unknown"} mm / 24h`,
          `48h ${toOneDecimal(current.rainfallLast48hMm) ?? "?"} mm, 72h ${toOneDecimal(current.rainfallLast72hMm) ?? "?"} mm`,
          data.confidences.rainfall,
          <CloudSun className="h-5 w-5" />,
          "lavender"
        )}
        {factorCard(
          "Weather",
          weatherNow,
          `Cloud cover ${toOneDecimal(current.cloudCoverPct) ?? "?"}% and UV ${uvText}. Best window UV ${bestUvText}.`,
          data.confidences.weather,
          <Thermometer className="h-5 w-5" />,
          "sunny"
        )}
        {factorCard(
          "Wind",
          current.windSpeedKph !== undefined ? `${toOneDecimal(current.windSpeedKph)} km/h ${windDirectionLabel(current.windDirectionDeg)}` : "Unknown",
          "Lower wind helps comfort and water surface quality.",
          data.confidences.weather,
          <Wind className="h-5 w-5" />,
          "aqua"
        )}
        {factorCard(
          "Water temperature",
          current.waterTempC !== undefined ? `${toOneDecimal(current.waterTempC)}°C` : "Unknown",
          "Nearest marine grid estimate for Sydney Harbour water near the baths.",
          data.confidences.marine,
          <Droplets className="h-5 w-5" />,
          "pink"
        )}
        {factorCard(
          "Tide",
          tideNow,
          "Lower tide scores better in this model. Falling or low tide gets a modest boost.",
          data.confidences.tides,
          <Waves className="h-5 w-5" />,
          "lavender"
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
          <Gauge className="h-5 w-5" />,
          "sunny"
        )}
        {factorCard(
          "Water polo",
          current.waterPoloActive === null ? "Unknown" : current.waterPoloActive ? "On" : "Not on",
          current.waterPoloNote,
          data.confidences.waterPolo,
          <ArrowUpRight className="h-5 w-5" />,
          "pink"
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="card rounded-[32px] p-6 md:p-7">
          <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-[var(--accent)]">Why the score looks like this</p>
          <h2 className="mt-3 font-display text-3xl"><span className="marker">Transparent scoring</span></h2>
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
            Each factor is normalized to a 0-1 preference score, then combined as a weighted sum out of 10. UV is
            displayed prominently but is not a major penalty on its own.
          </p>
          <div className="mt-6 space-y-3">
            {current.scoreBreakdown.map((item) => (
              <div key={item.key} className="rounded-2xl bg-white/80 p-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-semibold capitalize">{item.key}</span>
                  <span className="text-[var(--muted)]">
                    weight {item.weight.toFixed(2)} • contribution {item.contribution.toFixed(2)}
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-[#f3eefc]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#ff4f9a,#ffc93c,#1fc8e3)]"
                    style={{ width: `${item.normalized * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="card rounded-[32px] p-6 md:p-7">
          <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-[var(--accent)]">Advisory notes</p>
          <h2 className="mt-3 font-display text-3xl"><span className="marker">Assumptions and sources</span></h2>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-[var(--muted)]">
            {data.assumptions.map((assumption) => (
              <li key={assumption} className="rounded-2xl bg-white/80 px-4 py-3">
                {assumption}
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50/90 p-4 text-sm leading-6 text-amber-900">
            Advisory only. This dashboard is a decision aid, not a health or safety guarantee. Always use your
            judgment and official site notices before swimming.
          </div>
        </article>
      </section>

      <section className="mt-8 card rounded-[32px] p-6 md:p-7">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-[var(--accent)]">Sources</p>
            <h2 className="mt-2 font-display text-3xl"><span className="marker">Last updated and provenance</span></h2>
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
              className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4 transition hover:bg-white"
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
    </>
  );
}
