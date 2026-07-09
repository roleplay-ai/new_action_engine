import { NextResponse } from "next/server";

/**
 * Package activation is now client-side only:
 * - After the scheduled time (IST), package actions appear in Strategic Growth.
 * - The user accepts an action there (day/time) → it goes to the Validation Queue.
 * This route is a no-op kept for compatibility; no user_actions are created by cron.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");
    const expected = process.env.CRON_SECRET;

    if (expected && secret !== expected) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      message: "Package visibility is client-side; actions appear in Strategic Growth after scheduled time, then user accepts to add to Validation Queue.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

