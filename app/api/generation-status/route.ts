import { NextRequest, NextResponse } from "next/server";
import { getActiveGenerationJob } from "@/app/actions/ai-actions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Callers that already know the selected cohort (see lib/store.tsx) pass it as
  // ?cohortId=, letting this skip re-deriving it from scratch on every poll.
  const cohortId = request.nextUrl.searchParams.get("cohortId") ?? undefined;
  const result = await getActiveGenerationJob(cohortId);
  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
