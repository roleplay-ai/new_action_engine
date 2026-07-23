import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";

const ACTION_ENGINE_URL = "https://new-action-engine.vercel.app";

function appUrl(path: string) {
  return new URL(path, ACTION_ENGINE_URL);
}

/**
 * GET /api/auto-login?key=UUID
 *
 * Validates a persistent login key, generates and verifies a one-time token
 * server-side, sets the Supabase session cookies, and redirects into the app.
 * Logs every attempt to auto_login_logs.
 *
 * Internal use only. No emails sent.
 */
export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get("key");
    const requestedNext = request.nextUrl.searchParams.get("next");
    const safeNext =
      requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
        ? requestedNext
        : "/";
    if (!key || key.length < 30) {
      return NextResponse.redirect(appUrl("/login"));
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
      return NextResponse.redirect(appUrl("/login"));
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
      return NextResponse.redirect(appUrl("/login"));
    }

    // 3. Generate a one-time token. We verify it below instead of following
    // Supabase's action_link, so an outdated Auth Site URL cannot send the
    // participant to localhost.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: authUser.user.email,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      await admin.from("auto_login_logs").insert({
        user_id: profile.id,
        ip_address: ip,
        user_agent: userAgent,
        success: false,
      });
      return NextResponse.redirect(appUrl("/login"));
    }

    // 4. Verify server-side and attach the resulting session cookies to the
    // direct production-app response.
    const response = NextResponse.redirect(appUrl("/auth/callback"));
    const auth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(
            cookiesToSet: {
              name: string;
              value: string;
              options?: Parameters<typeof response.cookies.set>[2];
            }[]
          ) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );
    const {
      data: { session },
      error: verifyError,
    } = await auth.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });

    if (verifyError || !session) {
      await admin.from("auto_login_logs").insert({
        user_id: profile.id,
        ip_address: ip,
        user_agent: userAgent,
        success: false,
      });
      return NextResponse.redirect(appUrl("/login"));
    }

    // 5. Send the verified session through the production callback as a URL
    // fragment. Fragments are not included in HTTP requests or server logs,
    // and the callback persists the session in the destination browser before
    // entering the protected route. The response cookies above remain a
    // same-origin fast path.
    const callbackUrl = appUrl("/auth/callback");
    callbackUrl.searchParams.set("next", safeNext);
    callbackUrl.hash = new URLSearchParams({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: String(session.expires_in),
      token_type: session.token_type,
      type: "magiclink",
    }).toString();
    response.headers.set("location", callbackUrl.toString());

    // 6. Log success
    await admin.from("auto_login_logs").insert({
      user_id: profile.id,
      ip_address: ip,
      user_agent: userAgent,
      success: true,
    });

    return response;
  } catch (e) {
    console.error("[auto-login]", e);
    return NextResponse.redirect(appUrl("/login"));
  }
}
