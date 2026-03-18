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
              <stop offset="0%" stopColor="#1787a2" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#1787a2" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(18,52,68,0.08)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#5d7885", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 10]} tick={{ fill: "#5d7885", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              borderRadius: 18,
              border: "1px solid rgba(18,52,68,0.08)",
              boxShadow: "0 20px 40px rgba(18,52,68,0.12)",
              background: "rgba(255,255,255,0.95)"
            }}
            formatter={(value: number) => [`${value.toFixed(1)}/10`, "Score"]}
          />
          <Area type="monotone" dataKey="chartScore" stroke="#0f6c82" strokeWidth={3} fill="url(#scoreFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
