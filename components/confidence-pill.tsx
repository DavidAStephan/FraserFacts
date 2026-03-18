"use client";

import { MetricConfidence } from "@/lib/types";
import { confidenceTone } from "@/lib/utils";

export function ConfidencePill({ confidence }: { confidence: MetricConfidence }) {
  return (
    <span className={confidenceTone(confidence.level)} title={confidence.note}>
      <span>{confidence.label}</span>
      <span>{Math.round(confidence.value * 100)}%</span>
    </span>
  );
}
