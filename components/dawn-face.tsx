"use client";

import { clamp } from "@/lib/utils";

const EXPRESSIONS = [
  { min: 0, face: "😭", label: "Miserable" },
  { min: 1.5, face: "😢", label: "Very poor" },
  { min: 3, face: "🙁", label: "Poor" },
  { min: 4.5, face: "😕", label: "Mixed" },
  { min: 5.8, face: "🙂", label: "Okay" },
  { min: 7.2, face: "😊", label: "Good" },
  { min: 8.6, face: "😄", label: "Excellent" }
] as const;

function pickExpression(score: number) {
  return [...EXPRESSIONS].reverse().find((item) => score >= item.min) ?? EXPRESSIONS[0];
}

export function DawnFace({ score }: { score: number }) {
  const mood = clamp(score / 10);
  const expression = pickExpression(score);
  const ringOpacity = 0.24 + mood * 0.3;
  const glowOpacity = 0.08 + mood * 0.22;

  return (
    <div className="relative flex aspect-square w-full max-w-[320px] items-center justify-center overflow-hidden rounded-[32px] border border-white/60 bg-[linear-gradient(180deg,rgba(244,250,251,0.95),rgba(205,229,235,0.92))] shadow-[0_18px_40px_rgba(18,52,68,0.18)]">
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 30%, rgba(255,230,170,${glowOpacity}), transparent 42%), radial-gradient(circle at 50% 120%, rgba(15,108,130,0.12), transparent 44%)`
        }}
      />
      <div
        className="absolute inset-6 rounded-[26px] border"
        style={{
          borderColor: `rgba(15,108,130,${ringOpacity})`
        }}
      />
      <div className="relative text-center">
        <div
          aria-hidden="true"
          className="select-none leading-none"
          style={{
            fontSize: "7rem",
            filter: "drop-shadow(0 14px 24px rgba(18,52,68,0.18))"
          }}
        >
          {expression.face}
        </div>
      </div>
    </div>
  );
}
