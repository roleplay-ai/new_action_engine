import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseWhatsAppWebhook, verifyWhatsAppSignature } from "@/lib/whatsapp-webhook";

/**
 * WhatsApp Cloud API webhook receiver (Phase 1 of
 * docs/WHATSAPP_REMINDERS_PLAN.md). Records:
 *   - delivery status updates for messages we send → whatsapp_message_logs
 *   - messages participants send us → whatsapp_inbound_messages
 *   - any other subscribed field (template approvals, account alerts, ...)
 *     → whatsapp_webhook_events
 * See supabase/migrations/082_whatsapp_webhook.sql.
 *
 * GET is Meta's one-time verification handshake: it sends hub.mode=subscribe,
 * hub.verify_token and hub.challenge, and expects the challenge echoed back.
 *
 * POST requests are signed with X-Hub-Signature-256 (HMAC-SHA256 of the raw
 * body, keyed by the Meta app secret). Unlike the Resend webhook, an unsigned
 * request is never accepted: inbound messages will drive opt-outs and action
 * completion in later phases, so they must not be spoofable.
 *
 * Meta retries anything that isn't a 200, for up to 7 days, and may deliver
 * duplicates or out-of-order events. Every write is idempotent on the
 * WhatsApp message id, so a database error returns 500 to get a retry.
 *
 * Setup (once, in the Meta App Dashboard → WhatsApp → Configuration):
 *   1. Callback URL: https://<deployed-host>/api/webhooks/whatsapp
 *      Verify token: the value of WHATSAPP_WEBHOOK_VERIFY_TOKEN.
 *   2. Subscribe to the "messages" field (and optionally
 *      "message_template_status_update").
 *   3. Set WHATSAPP_APP_SECRET to App settings → Basic → App secret.
 */

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (
    verifyToken &&
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === verifyToken
  ) {
    return new Response(params.get("hub.challenge") ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error("[whatsapp-webhook] WHATSAPP_APP_SECRET is not configured — rejecting request");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  // Sign over the exact bytes Meta sent, before any decoding.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyWhatsAppSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { statuses, inbound, other } = parseWhatsAppWebhook(payload);
  const admin = createAdminClient();
  const errors: string[] = [];

  for (const event of statuses) {
    const { error } = await admin.rpc("record_whatsapp_message_status", {
      p_wamid: event.wamid,
      p_status: event.status,
      p_status_at: event.statusAt,
      p_recipient: event.recipient,
      p_error_code: event.errorCode,
      p_error_title: event.errorTitle,
      p_error_details: event.errorDetails,
      p_pricing_category: event.pricingCategory,
      p_conversation_id: event.conversationId,
    });
    if (error) errors.push(`status ${event.wamid}: ${error.message}`);
  }

  if (inbound.length) {
    const { error } = await admin.from("whatsapp_inbound_messages").upsert(
      inbound.map((message) => ({
        wamid: message.wamid,
        phone_number_id: message.phoneNumberId,
        from_phone: message.fromPhone,
        profile_name: message.profileName,
        message_type: message.messageType,
        text_body: message.textBody,
        reply_payload: message.replyPayload,
        context_wamid: message.contextWamid,
        payload: message.raw,
        received_at: message.receivedAt,
      })),
      { onConflict: "wamid", ignoreDuplicates: true }
    );
    if (error) errors.push(`inbound: ${error.message}`);
  }

  if (other.length) {
    const { error } = await admin
      .from("whatsapp_webhook_events")
      .insert(other.map((change) => ({ field: change.field, payload: change.value })));
    if (error) errors.push(`events: ${error.message}`);
  }

  if (errors.length) {
    console.error("[whatsapp-webhook] failed to record events", { errors });
    return NextResponse.json({ error: "Failed to record events" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
