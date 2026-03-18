import { ScoreMode, ScoredHour, ScoringWeights, HourlyCondition } from "@/lib/types";
import { average, clamp } from "@/lib/utils";

export const DEFAULT_WEIGHTS: Record<ScoreMode, ScoringWeights> = {
  strict: {
    pollution: 0.28,
    rainfall: 0.2,
    weather: 0.14,
    wind: 0.1,
    tide: 0.08,
    sunlight: 0.08,
    waterPolo: 0.06,
    waterTemp: 0.06
  },
  balanced: {
    pollution: 0.24,
    rainfall: 0.16,
    weather: 0.17,
    wind: 0.1,
    tide: 0.09,
    sunlight: 0.09,
    waterPolo: 0.06,
    waterTemp: 0.09
  }
};

function normalizeWeather(hour: HourlyCondition) {
  const tempScore =
    hour.airTempC === undefined
      ? 0.5
      : clamp(hour.airTempC <= 16 ? 0.15 : hour.airTempC >= 31 ? 1 : (hour.airTempC - 16) / 15);
  const sunBonus = clamp(((100 - (hour.cloudCoverPct ?? 50)) / 100) * 0.75 + ((hour.weatherCode ?? 3) <= 2 ? 0.25 : 0));
  return clamp(tempScore * 0.6 + sunBonus * 0.4);
}

function normalizeWaterTemp(hour: HourlyCondition) {
  if (hour.waterTempC === undefined) return 0.45;
  if (hour.waterTempC <= 16) return 0.25;
  if (hour.waterTempC >= 24) return 0.92;
  return clamp(0.25 + ((hour.waterTempC - 16) / 8) * 0.67);
}

function normalizeWind(hour: HourlyCondition) {
  if (hour.windSpeedKph === undefined) return 0.5;
  if (hour.windSpeedKph <= 8) return 1;
  if (hour.windSpeedKph >= 30) return 0.12;
  return clamp(1 - (hour.windSpeedKph - 8) / 22);
}

function normalizeTide(hour: HourlyCondition) {
  if (hour.tideHeightM === undefined) return 0.45;
  const heightScore = clamp(1 - (hour.tideHeightM - 0.45) / 1.35);
  const stateBonus = hour.tideState === "low" ? 0.12 : hour.tideState === "falling" ? 0.08 : 0;
  return clamp(heightScore + stateBonus);
}

function normalizePollution(hour: HourlyCondition) {
  if (hour.pollutionRiskScore === undefined) return 0.45;
  return clamp(1 - hour.pollutionRiskScore);
}

function normalizeRainfall(hour: HourlyCondition) {
  if (hour.rainfallPenaltyScore === undefined) return 0.5;
  return clamp(1 - hour.rainfallPenaltyScore);
}

function normalizeSunlight(hour: HourlyCondition) {
  if (hour.sunlightScore === undefined) return 0.45;
  return clamp(hour.sunlightScore);
}

function normalizeWaterPolo(hour: HourlyCondition) {
  if (hour.waterPoloActive === null) return 0.55;
  return hour.waterPoloActive ? 0.15 : 1;
}

export function scoreHour(hour: HourlyCondition, weights: ScoringWeights): ScoredHour {
  const normalized = {
    pollution: normalizePollution(hour),
    rainfall: normalizeRainfall(hour),
    weather: normalizeWeather(hour),
    wind: normalizeWind(hour),
    tide: normalizeTide(hour),
    sunlight: normalizeSunlight(hour),
    waterPolo: normalizeWaterPolo(hour),
    waterTemp: normalizeWaterTemp(hour)
  };

  const scoreBreakdown = (Object.keys(weights) as Array<keyof ScoringWeights>).map((key) => ({
    key,
    weight: weights[key],
    normalized: normalized[key],
    contribution: normalized[key] * weights[key] * 10,
    summary: `${Math.round(normalized[key] * 100)}%`
  }));

  const weightedTotal = scoreBreakdown.reduce((sum, item) => sum + item.contribution, 0);
  const score = Math.round(weightedTotal * 10) / 10;
  const confidence = clamp(average([hour.rawConfidence, 0.8]));
  const summary = buildScoreSummary(hour, normalized, score);

  return {
    ...hour,
    score,
    confidence,
    scoreBreakdown,
    summary
  };
}

function buildScoreSummary(
  hour: HourlyCondition,
  normalized: Record<keyof ScoringWeights, number>,
  score: number
) {
  const strongestWins = Object.entries(normalized)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key]) => key);
  const weakest = Object.entries(normalized)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 2)
    .map(([key]) => key);

  const reasons: string[] = [];
  if (strongestWins.includes("pollution")) reasons.push("water quality context is relatively favourable");
  if (strongestWins.includes("weather")) reasons.push("the weather is warm and reasonably bright");
  if (strongestWins.includes("sunlight")) reasons.push("the baths should get useful direct sun");
  if (strongestWins.includes("tide")) reasons.push("tide conditions lean toward your low-tide preference");
  if (weakest.includes("rainfall")) reasons.push("recent rain is still dragging confidence down");
  if (weakest.includes("wind")) reasons.push("wind is making the harbour less comfortable");
  if (weakest.includes("waterPolo")) reasons.push("water polo reduces usable swim space");

  if (!reasons.length) {
    reasons.push("conditions are mixed");
  }

  const prefix =
    score >= 8 ? "Very promising:" : score >= 6 ? "Decent but not perfect:" : score >= 4 ? "Mixed conditions:" : "Weak swim window:";
  return `${prefix} ${reasons.join(", ")}.`;
}

export function scoreTimeline(timeline: HourlyCondition[], weights: ScoringWeights) {
  return timeline.map((hour) => scoreHour(hour, weights));
}

export function recommendationLabel(score: number) {
  if (score >= 8) return "Excellent time to swim";
  if (score >= 6) return "Good, with a few trade-offs";
  if (score >= 4.5) return "Okay, but not ideal";
  return "Avoid swimming today";
}

export function explainBestTime(current: ScoredHour, best: ScoredHour) {
  if (best.isoTime === current.isoTime) {
    return "Current conditions already look as good as the rest of today based on the available data.";
  }

  const gains = best.scoreBreakdown
    .map((item, index) => ({
      key: item.key,
      delta: item.normalized - current.scoreBreakdown[index].normalized
    }))
    .sort((a, b) => b.delta - a.delta)
    .filter((item) => item.delta > 0.08)
    .slice(0, 4)
    .map((item) => {
      switch (item.key) {
        case "weather":
          return "it should be warmer and brighter";
        case "wind":
          return "wind eases";
        case "tide":
          return "tide conditions improve";
        case "sunlight":
          return "the baths should catch more direct sun";
        case "waterTemp":
          return "water temperature improves slightly";
        case "rainfall":
          return "rainfall drag matters less in the scoring mix";
        case "waterPolo":
          return "the pool space opens up";
        case "pollution":
          return "pollution context is more favourable";
        default:
          return null;
      }
    })
    .filter((value): value is Exclude<typeof value, null> => value !== null);

  return `Best later because ${gains.length ? gains.join(", ") : "the combined conditions edge higher than now"}.`;
}
