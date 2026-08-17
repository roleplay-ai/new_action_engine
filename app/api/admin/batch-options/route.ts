import { NextResponse } from "next/server";
import { getBatchOptions } from "@/app/actions/admin-dashboard";

export const dynamic = "force-dynamic";

function statusForThrown(message: string) {
  if (message === "Not authenticated") return 401;
  if (message.startsWith("Forbidden")) return 403;
  return 500;
}

export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId") ?? undefined;

  try {
    const result = await getBatchOptions(companyId);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json(
      { error: message, options: [] },
      { status: statusForThrown(message), headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }
}
