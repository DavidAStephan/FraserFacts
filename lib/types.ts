export type ConfidenceLevel = "high" | "medium" | "low";

export type MetricConfidence = {
  label: string;
  value: number;
  level: ConfidenceLevel;
  note?: string;
  updatedAt?: string;
  source?: {
    name: string;
    url: string;
  };
};

export type SourceReference = {
  name: string;
  url: string;
  lastUpdated?: string;
  note?: string;
};

export type HourlyCondition = {
  isoTime: string;
  label: string;
  isNow: boolean;
  isBathsOpen: boolean;
  openStatusReason: string;
  weatherCode?: number;
  weatherLabel: string;
  airTempC?: number;
  waterTempC?: number;
  windSpeedKph?: number;
  windDirectionDeg?: number;
  uvIndex?: number;
  cloudCoverPct?: number;
  precipitationMm?: number;
  tideHeightM?: number;
  tideState?: "rising" | "falling" | "high" | "low" | "unknown";
  sunlightScore?: number;
  sunlightLabel: string;
  pollutionRiskScore?: number;
  pollutionSummary: string;
  rainfallPenaltyScore?: number;
  rainfallLast24hMm?: number;
  rainfallLast48hMm?: number;
  rainfallLast72hMm?: number;
  waterPoloActive: boolean | null;
  waterPoloNote: string;
  rawConfidence: number;
  confidenceNote?: string;
};

export type ScoringWeights = {
  pollution: number;
  rainfall: number;
  weather: number;
  wind: number;
  tide: number;
  sunlight: number;
  waterPolo: number;
  waterTemp: number;
};

export type ScoredHour = HourlyCondition & {
  score: number;
  confidence: number;
  scoreBreakdown: Array<{
    key: keyof ScoringWeights;
    weight: number;
    normalized: number;
    contribution: number;
    summary: string;
  }>;
  summary: string;
};

export type ScoreMode = "strict" | "balanced";

export type AggregatedResponse = {
  fetchedAt: string;
  timezone: string;
  mode: ScoreMode;
  defaultWeights: Record<ScoreMode, ScoringWeights>;
  current: ScoredHour;
  bestToday: ScoredHour;
  recommendation: string;
  bestWindow: string;
  bestWindowReason: string;
  bathsStatus: {
    isOpenNow: boolean;
    statusLabel: string;
    reason: string;
    nextOpenWindow?: string;
  };
  timeline: HourlyCondition[];
  sources: SourceReference[];
  confidences: {
    current: MetricConfidence;
    best: MetricConfidence;
    pollution: MetricConfidence;
    tides: MetricConfidence;
    weather: MetricConfidence;
    marine: MetricConfidence;
    rainfall: MetricConfidence;
    waterPolo: MetricConfidence;
    openingHours: MetricConfidence;
  };
  assumptions: string[];
};
