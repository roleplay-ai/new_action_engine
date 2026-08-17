import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resend webhook receiver — handles `email.opened` and `email.clicked`, to
 * power the admin Dashboard's email engagement section (see
 * app/actions/admin-dashboard.ts).
 *
 * Resend signs webhook requests the same way Svix does: `svix-id`,
 * `svix-timestamp`, `svix-signature` headers, where the signature is an
 * HMAC-SHA256 (base64) over `${svix-id}.${svix-timestamp}.${rawBody}`, keyed
 * by the webhook signing secret (the part after `whsec_`, base64-decoded).
 * Verified here with Node's built-in `crypto` — no extra dependency needed.
 *
 * Setup (done once, outside this repo, by whoever owns the Resend account):
 *   1. Resend dashboard → Webhooks → add an endpoint pointing at
 *      https://<deployed-host>/api/webhooks/resend, subscribed to at least
 *      "email.opened" and "email.clicked".
 *   2. Resend dashboard → enable Open Tracking AND Click Tracking (per-domain
 *      settings) — neither is reported unless its toggle is on.
 *   3. Copy the endpoint's signing secret into RESEND_WEBHOOK_SECRET.
 * Until both are done, this route still verifies/accepts requests but there
 * will be nothing to receive — the Dashboard shows a "not enabled yet" banner
 * in that case rather than treating it as an error.
 */

function verifySignature(rawBody: string, svixId: string, svixTimestamp: string, svixSignature: string, secret: string): boolean {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  // svix-signature can carry multiple space-separated "v1,<base64>" values.
  const candidates = svixSignature
    .split(" ")
    .map((part) => part.split(",")[1])
    .filter((v): v is string => !!v);

  return candidates.some((candidate) => {
    const a = Buffer.from(candidate);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");
    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: "Missing signature headers" }, { status: 401 });
    }
    if (!verifySignature(rawBody, svixId, svixTimestamp, svixSignature, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }
  // If RESEND_WEBHOOK_SECRET isn't configured yet, we still accept the
  // request unverified rather than hard-failing — matches this repo's
  // pattern of feature flags degrading gracefully (see isResendConfigured()).

  let payload: { type?: string; data?: { email_id?: string } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if ((payload.type === "email.opened" || payload.type === "email.clicked") && payload.data?.email_id) {
    const admin = createAdminClient();
    const messageId = payload.data.email_id;

    const { data: row } = await admin
      .from("email_campaign_logs")
      .select("id, opened_at, open_count, clicked_at, click_count")
      .eq("resend_message_id", messageId)
      .maybeSingle();

    if (row) {
      const now = new Date().toISOString();
      if (payload.type === "email.opened") {
        await admin
          .from("email_campaign_logs")
          .update({
            opened_at: row.opened_at ?? now,
            last_opened_at: now,
            open_count: (row.open_count ?? 0) + 1,
          })
          .eq("id", row.id);
      } else {
        await admin
          .from("email_campaign_logs")
          .update({
            clicked_at: row.clicked_at ?? now,
            last_clicked_at: now,
            click_count: (row.click_count ?? 0) + 1,
          })
          .eq("id", row.id);
      }
    }
  }

  // Always 200 on a parsed, recognized (or harmlessly ignored) payload so
  // Resend doesn't retry-storm us for event types we don't care about yet.
  return NextResponse.json({ received: true });
}
