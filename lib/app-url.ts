/** The live app every participant-facing link points at. */
export const PRODUCTION_APP_URL = "https://practice.nudgeable.ai";

/**
 * Origin used for email links and the auto-login redirect.
 *
 * Defaults to the production app. Set the server-only NUDGEABLE_APP_URL
 * (e.g. http://localhost:3000 or a Vercel preview URL) to test the full
 * email → sign-in → app flow against a non-production deployment. Never set
 * it in production. Deliberately not NEXT_PUBLIC_APP_URL, which points at the
 * Vercel deployment URL that participants must never land on.
 */
export function getAppUrl(): string {
  const override = process.env.NUDGEABLE_APP_URL?.trim();
  if (!override) return PRODUCTION_APP_URL;
  try {
    const url = new URL(override);
    if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
  } catch {
    // Fall through to the warning below.
  }
  console.warn(`[app-url] Ignoring invalid NUDGEABLE_APP_URL "${override}"; using ${PRODUCTION_APP_URL}.`);
  return PRODUCTION_APP_URL;
}
