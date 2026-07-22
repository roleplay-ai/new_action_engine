import { NextResponse } from "next/server";
import { getActiveGenerationJob } from "@/app/actions/ai-actions";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getActiveGenerationJob();
  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
