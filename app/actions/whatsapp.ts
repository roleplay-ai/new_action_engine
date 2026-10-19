"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatWhatsAppNumber } from "@/lib/whatsapp-contacts";
import { saveWhatsAppNumber } from "@/lib/whatsapp-contact-store";

/**
 * Participant-facing WhatsApp reminder settings (Phase 2 of
 * docs/WHATSAPP_REMINDERS_PLAN.md). whatsapp_contacts is service-role only,
 * so every action authenticates the caller first and then reads/writes only
 * that caller's own rows with the admin client.
 */

export type MyWhatsAppSettings = {
  /** False until WHATSAPP_PHONE_NUMBER_ID is set — the UI hides WhatsApp options. */
  available: boolean;
  /** The participant's number, formatted for display/editing ("+91 98000 00000"). */
  phone: string | null;
  /** They replied STOP on WhatsApp; reminders are paused for every plan. */
  optedOut: boolean;
  /** This plan's own WhatsApp setting (null when no cohort/plan was asked about). */
  planEnabled: boolean | null;
};

function isWhatsAppAvailable(): boolean {
  return !!process.env.WHATSAPP_PHONE_NUMBER_ID;
}

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function getMyWhatsAppSettings(cohortId?: string): Promise<{ settings?: MyWhatsAppSettings; error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Not authenticated" };
  if (!isWhatsAppAvailable()) {
    return { settings: { available: false, phone: null, optedOut: false, planEnabled: null } };
  }

  const admin = createAdminClient();
  const [{ data: contact, error: contactError }, planResult] = await Promise.all([
    admin.from("whatsapp_contacts").select("phone, opted_out_at").eq("user_id", userId).maybeSingle(),
    cohortId
      ? admin
          .from("personal_action_subscriptions")
          .select("whatsapp_reminders_enabled")
          .eq("user_id", userId)
          .eq("cohort_id", cohortId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (contactError) return { error: contactError.message };
  if (planResult.error) return { error: planResult.error.message };

  return {
    settings: {
      available: true,
      phone: contact ? formatWhatsAppNumber(contact.phone) : null,
      optedOut: !!contact?.opted_out_at,
      planEnabled: planResult.data ? planResult.data.whatsapp_reminders_enabled === true : null,
    },
  };
}

/**
 * Turns WhatsApp reminders on/off for one of the caller's plans, saving the
 * number shown alongside the switch. Turning on is an explicit opt-in, so it
 * also clears an earlier STOP.
 */
export async function updateMyWhatsAppReminders(params: {
  cohortId: string;
  enabled: boolean;
  phone: string;
}): Promise<{ settings?: MyWhatsAppSettings; error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Not authenticated" };
  if (!isWhatsAppAvailable()) return { error: "WhatsApp reminders are not available yet" };

  const admin = createAdminClient();
  const { data: plan, error: planError } = await admin
    .from("personal_action_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("cohort_id", params.cohortId)
    .maybeSingle();
  if (planError) return { error: planError.message };
  if (!plan) return { error: "No plan found for this batch" };

  if (params.enabled || params.phone.trim()) {
    if (params.enabled && !params.phone.trim()) return { error: "Enter your WhatsApp number to turn reminders on" };
    const saved = await saveWhatsAppNumber(admin, { userId, rawNumber: params.phone, source: "participant", updatedBy: userId });
    if (saved.error) return { error: saved.error };
  }

  const now = new Date().toISOString();
  if (params.enabled) {
    const { error } = await admin
      .from("whatsapp_contacts")
      .update({ opted_out_at: null, updated_at: now })
      .eq("user_id", userId);
    if (error) return { error: error.message };
  }

  const { error } = await admin
    .from("personal_action_subscriptions")
    .update(
      params.enabled
        ? { whatsapp_reminders_enabled: true, whatsapp_opted_in_at: now }
        : { whatsapp_reminders_enabled: false }
    )
    .eq("id", plan.id);
  if (error) return { error: error.message };

  return getMyWhatsAppSettings(params.cohortId);
}
