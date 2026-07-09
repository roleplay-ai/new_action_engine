import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/auto-login?key=UUID
 *
 * Validates persistent login key, generates a one-time magic link,
 * and redirects to Supabase verify → /auth/callback with session.
 * Logs every attempt to auto_login_logs.
 *
 * Internal use only. No emails sent.
 */
export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get("key");
    if (!key || key.length < 30) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const admin = createAdminClient();
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? request.headers.get("x-real-ip")
      ?? "unknown";
    const userAgent = request.headers.get("user-agent") ?? "";

    // 1. Find profile by persistent_login_key
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id")
      .eq("persistent_login_key", key)
      .single();

    if (profileError || !profile) {
      await admin.from("auto_login_logs").insert({
        user_id: null,
        ip_address: ip,
        user_agent: userAgent,
        success: false,
      });
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // 2. Get user email (required for generateLink)
    const { data: authUser, error: authError } = await admin.auth.admin.getUserById(profile.id);
    if (authError || !authUser?.user?.email) {
      await admin.from("auto_login_logs").insert({
        user_id: profile.id,
        ip_address: ip,
        user_agent: userAgent,
        success: false,
      });
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // 3. Build callback URL (must be in Supabase redirect URLs)
    const base = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    const redirectTo = `${base}/auth/callback`;

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: authUser.user.email,
      options: { redirectTo },
    });

    if (linkError || !linkData?.properties?.action_link) {
      await admin.from("auto_login_logs").insert({
        user_id: profile.id,
        ip_address: ip,
        user_agent: userAgent,
        success: false,
      });
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // 4. Log success
    await admin.from("auto_login_logs").insert({
      user_id: profile.id,
      ip_address: ip,
      user_agent: userAgent,
      success: true,
    });

    // 5. Redirect to Supabase verify; it will redirect to /auth/callback with tokens
    return NextResponse.redirect(linkData.properties.action_link);
  } catch (e) {
    console.error("[auto-login]", e);
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
