/**
 * Acts on a message a participant sent to the business number (called by
 * app/api/webhooks/whatsapp/route.ts for each newly received message):
 *   - STOP / UNSUBSCRIBE → opts the sender out of WhatsApp reminders on
 *     every plan (whatsapp_contacts.opted_out_at)
 *   - START → opts back in, and turns WhatsApp on for their unarchived plans
 * Anything else is just stored by the route. Confirmation replies are
 * free-form text (the participant has just messaged us, so the 24-hour window
 * is open) and are skipped when sending isn't configured.
 *
 * Throws on database errors so the route can let Meta retry.
 */
import type { createAdminClient } from "@/lib/supabase/admin";
import { parseOptKeyword } from "@/lib/whatsapp-contacts";
import { isWhatsAppSendConfigured, sendWhatsAppText } from "@/lib/whatsapp";
import type { WhatsAppInboundMessage } from "@/lib/whatsapp-webhook";

type AdminClient = ReturnType<typeof createAdminClient>;

const REPLIES = {
  stopped: "You've turned off Nudgeable reminders on WhatsApp. Reply START to turn them back on.",
  started: "WhatsApp reminders are back on ✅ Reply STOP anytime to turn them off.",
  notConnected:
    "This number isn't linked to a Nudgeable account yet. Ask your programme admin to add it, or add it in the app under My Actions → Plan overview.",
} as const;

export async function handleInboundMessage(admin: AdminClient, message: WhatsAppInboundMessage): Promise<void> {
  const keyword = parseOptKeyword(message.textBody);
  if (!keyword) return;

  const { data: contact, error: contactError } = await admin
    .from("whatsapp_contacts")
    .select("user_id, opted_out_at")
    .eq("phone", message.fromPhone)
    .maybeSingle();
  if (contactError) throw new Error(`load contact: ${contactError.message}`);

  const now = new Date().toISOString();

  if (keyword === "stop") {
    // Nothing to opt out of for an unknown number; WhatsApp's own blocking
    // still works for them.
    if (!contact) return;
    if (!contact.opted_out_at) {
      const { error } = await admin
        .from("whatsapp_contacts")
        .update({ opted_out_at: now, profile_name: message.profileName, updated_at: now })
        .eq("user_id", contact.user_id);
      if (error) throw new Error(`opt out: ${error.message}`);
    }
    await sendReply(message.fromPhone, REPLIES.stopped, contact.user_id, "whatsapp_opt_out");
    return;
  }

  if (!contact) {
    await sendReply(message.fromPhone, REPLIES.notConnected, null, "whatsapp_opt_in");
    return;
  }

  const { error: contactUpdateError } = await admin
    .from("whatsapp_contacts")
    .update({ opted_out_at: null, profile_name: message.profileName, updated_at: now })
    .eq("user_id", contact.user_id);
  if (contactUpdateError) throw new Error(`opt in: ${contactUpdateError.message}`);

  // START is an explicit request for reminders, so it also re-enables plans
  // where WhatsApp was unticked or turned off.
  const { error: planError } = await admin
    .from("personal_action_subscriptions")
    .update({ whatsapp_reminders_enabled: true, whatsapp_opted_in_at: now })
    .eq("user_id", contact.user_id)
    .eq("whatsapp_reminders_enabled", false)
    .is("archived_at", null);
  if (planError) throw new Error(`enable plans: ${planError.message}`);

  await sendReply(message.fromPhone, REPLIES.started, contact.user_id, "whatsapp_opt_in");
}

/** Best-effort confirmation; a failed reply never fails the webhook. */
async function sendReply(to: string, body: string, userId: string | null, purpose: string) {
  if (!isWhatsAppSendConfigured()) return;
  const result = await sendWhatsAppText({ to, body, userId, purpose });
  if (!result.ok) console.error("[whatsapp-inbound] reply failed", { purpose, error: result.error });
}
