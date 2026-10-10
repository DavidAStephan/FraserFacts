"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { HourlyCondition, ScoreMode, ScoringWeights } from "@/lib/types";
import { scoreTimeline } from "@/lib/scoring";

type Props = {
  timeline: HourlyCondition[];
  weights: ScoringWeights;
  mode: ScoreMode;
};

export function HourlyChart({ timeline, weights }: Props) {
  const scored = scoreTimeline(timeline, weights).map((hour) => ({
    ...hour,
    chartScore: hour.score
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={scored} margin={{ left: -18, right: 8, top: 16, bottom: 0 }}>
          <defs>
            <linearGradient id="scoreFill" x1="0%" x2="0%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#ff4f9a" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#1fc8e3" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="scoreStroke" x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor="#9b7bff" />
              <stop offset="50%" stopColor="#ff4f9a" />
              <stop offset="100%" stopColor="#ffb020" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(155,123,255,0.15)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#6b6390", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 10]} tick={{ fill: "#6b6390", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              borderRadius: 18,
              border: "2px solid #ffd3ea",
              boxShadow: "0 4px 0 rgba(43,35,80,0.1)",
              background: "rgba(255,255,255,0.95)"
            }}
            formatter={(value: number) => [`${value.toFixed(1)}/10`, "Score"]}
          />
          <Area type="monotone" dataKey="chartScore" stroke="url(#scoreStroke)" strokeWidth={4} fill="url(#scoreFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
