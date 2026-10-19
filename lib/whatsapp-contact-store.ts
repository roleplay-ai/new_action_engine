/**
 * Writes to whatsapp_contacts shared by the admin and participant server
 * actions. Server-only (service-role client); callers do their own auth.
 */
import type { createAdminClient } from "@/lib/supabase/admin";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp-contacts";

type AdminClient = ReturnType<typeof createAdminClient>;

export const INVALID_WHATSAPP_NUMBER_ERROR =
  "Enter a valid WhatsApp number, e.g. +91 98000 00000";

/**
 * Saves (or, for an empty value, removes) a person's WhatsApp number.
 * Saving a different number clears a previous STOP — the new number has
 * never opted out. Re-saving the same number leaves the opt-out alone.
 */
export async function saveWhatsAppNumber(
  admin: AdminClient,
  params: { userId: string; rawNumber: string; source: "admin" | "participant"; updatedBy: string }
): Promise<{ phone?: string | null; error?: string }> {
  if (!params.rawNumber.trim()) {
    const { error } = await admin.from("whatsapp_contacts").delete().eq("user_id", params.userId);
    return error ? { error: error.message } : { phone: null };
  }

  const phone = normalizeWhatsAppNumber(params.rawNumber);
  if (!phone) return { error: INVALID_WHATSAPP_NUMBER_ERROR };

  const { data: existing, error: loadError } = await admin
    .from("whatsapp_contacts")
    .select("phone")
    .eq("user_id", params.userId)
    .maybeSingle();
  if (loadError) return { error: loadError.message };
  if (existing?.phone === phone) return { phone };

  const now = new Date().toISOString();
  const { error } = await admin.from("whatsapp_contacts").upsert(
    {
      user_id: params.userId,
      phone,
      phone_source: params.source,
      phone_updated_by: params.updatedBy,
      opted_out_at: null,
      updated_at: now,
    },
    { onConflict: "user_id" }
  );
  if (error) {
    return error.code === "23505"
      ? { error: "This WhatsApp number is already used by another participant" }
      : { error: error.message };
  }
  return { phone };
}
