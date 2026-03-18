import { NextResponse } from "next/server";
import { getConditions } from "@/lib/data";
import { ScoreMode } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedMode = searchParams.get("mode");
    const mode: ScoreMode = requestedMode === "strict" ? "strict" : "balanced";
    const payload = await getConditions(mode);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=0, s-maxage=0, stale-while-revalidate=60"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: message
      },
      { status: 500 }
    );
  }
}
