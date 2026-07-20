"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResendConfigured } from "@/lib/resend";
import { sendTemplateToUsers } from "@/lib/email-send";
import { buildWeeklyEmailTemplateDataForUser } from "@/lib/weekly-email";

const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || "admin@actionengine").toLowerCase();

async function ensureSuperadmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const isSuperadminEmail = user.email?.toLowerCase() === SUPERADMIN_EMAIL;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "superadmin" && !isSuperadminEmail) {
    throw new Error("Forbidden: superadmin only");
  }

  return user.id;
}

export type SendEmailResult = {
  userId: string;
  email: string;
  success: boolean;
  error?: string;
};

/**
 * Send auto-login emails to selected users.
 * Returns results for each user (success/failure).
 */
export async function sendAutoLoginEmails(
  userIds: string[]
): Promise<{ results: SendEmailResult[]; error?: string }> {
  try {
    const sentById = await ensureSuperadmin();

    if (!isResendConfigured()) {
      return {
        results: [],
        error: "Resend not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL in environment.",
      };
    }

    if (userIds.length === 0) {
      return { results: [], error: "No users selected" };
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const fromEmail = process.env.RESEND_FROM_EMAIL!;
    const results = await sendTemplateToUsers({
      userIds,
      templateId: "weekly_challenges",
      fromEmail,
      baseUrl,
      sentBy: sentById,
      // For one-time manual sends, we still want the Weekly Challenges data
      // so the same template can be reused without blank sections.
      getPerUserTemplateData: async (userId) => {
        const data = await buildWeeklyEmailTemplateDataForUser(userId, { baseUrl });
        return data as unknown as Record<string, unknown>;
      },
    });

    revalidatePath("/superadmin/users");
    return { results };
  } catch (e) {
    return { results: [], error: e instanceof Error ? e.message : "Failed" };
  }
}

/**
 * Check if a user was sent an email within the last N hours.
 */
export async function wasEmailSentRecently(
  userId: string,
  hoursAgo: number = 24
): Promise<boolean> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

    const { data } = await admin
      .from("email_campaign_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "sent")
      .gte("created_at", cutoff)
      .limit(1);

    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Get recent email logs for display.
 */
export async function getRecentEmailLogs(limit: number = 50): Promise<
  { id: string; email: string; status: string; created_at: string }[] | { error: string }
> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("email_campaign_logs")
      .select("id, email, status, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return { error: error.message };
    return data ?? [];
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}
