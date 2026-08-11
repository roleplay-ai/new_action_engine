import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // sw.js and manifest.webmanifest must always be served directly, even
    // when logged out — a redirected service worker script or manifest
    // fetch is rejected by the browser, which silently kills PWA
    // installability (this is why the install button never appeared on
    // the logged-out login page).
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|api/cron|api/generate-actions-batch|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
