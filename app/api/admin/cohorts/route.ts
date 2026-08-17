import { NextResponse } from "next/server";
import { listCohorts } from "@/app/actions/cohorts";

export const dynamic = "force-dynamic";

function statusForThrown(message: string) {
  if (message === "Not authenticated") return 401;
  if (message.startsWith("Forbidden")) return 403;
  return 500;
}

export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  try {
    const result = await listCohorts(companyId);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json(
      { error: message },
      { status: statusForThrown(message), headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }
}
