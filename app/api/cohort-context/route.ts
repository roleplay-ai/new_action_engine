import { NextResponse } from "next/server";
import { getMyCohorts } from "@/app/actions/cohorts";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getMyCohorts();
  const status = !result.error
    ? 200
    : result.error === "Not authenticated"
      ? 401
      : 500;
  return NextResponse.json(result, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
