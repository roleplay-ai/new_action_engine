import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Server Actions (the "Next-Action" header) and every /api/* route already run
  // their own supabase.auth.getUser() check and return a graceful error/401 when
  // unauthenticated — and, unlike Server Components, both can persist a refreshed
  // session cookie themselves via next/headers (see lib/supabase/server.ts), so
  // they don't depend on middleware for token refresh either. Re-running
  // updateSession()'s own auth.getUser() here first was a second real network
  // round-trip to Supabase's auth server on top of that self-check, for every
  // single one of these requests — a page like /actions fires 6+ of them
  // (several server actions plus a couple of internal API fetches) on one load,
  // so this was pure duplicated latency, not additional protection: a redirect
  // response isn't meaningful for a fetch()/server-action call anyway, since the
  // handler's own check already rejects it gracefully.
  if (request.headers.has("next-action") || request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    // sw.js and manifest.webmanifest must always be served directly, even
    // when logged out — a redirected service worker script or manifest
    // fetch is rejected by the browser, which silently kills PWA
    // installability (this is why the install button never appeared on
    // the logged-out login page).
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
