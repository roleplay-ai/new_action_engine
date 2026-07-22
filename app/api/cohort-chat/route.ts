import { NextRequest, NextResponse } from "next/server";
import { getCohortMessages } from "@/app/actions/cohort-chat";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cohortId = request.nextUrl.searchParams.get("cohortId")?.trim();
  if (!cohortId) {
    return NextResponse.json({ error: "Cohort is required" }, { status: 400 });
  }

  const result = await getCohortMessages(cohortId);
  return NextResponse.json(result, {
    status: result.error ? 403 : 200,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
