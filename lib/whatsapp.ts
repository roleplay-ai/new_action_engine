/**
 * WhatsApp Cloud API sender. Server-only.
 *
 * Needs WHATSAPP_ACCESS_TOKEN (a system user token with
 * whatsapp_business_messaging) and WHATSAPP_PHONE_NUMBER_ID (the business
 * number's id). Until both are set, isWhatsAppSendConfigured() is false and
 * callers skip sending — the same degrade-gracefully pattern as
 * isResendConfigured().
 *
 * Every accepted send is recorded in whatsapp_message_logs so the webhook's
 * status updates (sent / delivered / read / failed) attach to it.
 */
import { createAdminClient } from "@/lib/supabase/admin";

const GRAPH_API_VERSION = "v23.0";

export function isWhatsAppSendConfigured(): boolean {
  return !!process.env.WHATSAPP_ACCESS_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID;
}

export type WhatsAppSendResult = { ok: true; wamid: string } | { ok: false; error: string };

/**
 * Free-form text. Only delivered if the recipient messaged the business in
 * the last 24 hours — use it for replies, not for reminders.
 */
export async function sendWhatsAppText(params: {
  to: string;
  body: string;
  userId?: string | null;
  purpose: string;
}): Promise<WhatsAppSendResult> {
  if (!isWhatsAppSendConfigured()) return { ok: false, error: "WhatsApp sending is not configured" };

  const to = params.to.replace(/\D/g, "");
  let response: Response;
  try {
    response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { body: params.body },
        }),
      }
    );
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Network error" };
  }

  const json = (await response.json().catch(() => null)) as
    | { messages?: { id?: string }[]; error?: { message?: string; code?: number } }
    | null;
  const wamid = json?.messages?.[0]?.id;
  if (!response.ok || !wamid) {
    const detail = json?.error ? `${json.error.code ?? response.status}: ${json.error.message}` : `HTTP ${response.status}`;
    return { ok: false, error: detail };
  }

  await recordAcceptedMessage({ wamid, to, userId: params.userId ?? null, purpose: params.purpose });
  return { ok: true, wamid };
}

/**
 * The webhook can record a status for this wamid before we get here, so
 * insert-if-missing first, then attach who/why without touching the status.
 */
async function recordAcceptedMessage(params: { wamid: string; to: string; userId: string | null; purpose: string }) {
  const admin = createAdminClient();
  const { error: insertError } = await admin
    .from("whatsapp_message_logs")
    .upsert({ wamid: params.wamid, to_phone: params.to, status: "accepted" }, { onConflict: "wamid", ignoreDuplicates: true });
  const { error: updateError } = await admin
    .from("whatsapp_message_logs")
    .update({ user_id: params.userId, purpose: params.purpose, updated_at: new Date().toISOString() })
    .eq("wamid", params.wamid);
  if (insertError || updateError) {
    console.error("[whatsapp] failed to log accepted message", {
      wamid: params.wamid,
      error: insertError?.message ?? updateError?.message,
    });
  }
}
