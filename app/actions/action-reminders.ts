"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const SUPERADMIN_EMAIL = (
  process.env.SUPERADMIN_EMAIL || "admin@actionengine"
).toLowerCase();

async function ensureSuperadmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
}

export type ActionReminderLog = {
  id: string;
  userId: string;
  email: string;
  fullName: string | null;
  actions: { id: string; title: string; theme: string }[];
  actionCount: number;
  status: "sent" | "failed";
  errorMessage: string | null;
  cohortName: string | null;
  scheduledFor: string | null;
  reminderDate: string | null;
  createdAt: string;
};

/** Send history for the per-user daily/weekly action-reminder emails, newest first. */
export async function getActionReminderLogs(
  limit = 100
): Promise<{ data: ActionReminderLog[] } | { error: string }> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const { data: logs, error } = await admin
      .from("personal_action_reminder_logs")
      .select("id, user_id, cohort_id, email, actions, action_count, status, error_message, scheduled_for, reminder_date, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return { error: error.message };

    const userIds = [...new Set((logs ?? []).map((l) => l.user_id))];
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string | null]));
    const cohortIds = [...new Set((logs ?? []).map((log) => log.cohort_id).filter(Boolean))];
    const { data: cohorts } = await admin
      .from("cohorts")
      .select("id, name")
      .in("id", cohortIds.length ? cohortIds : ["00000000-0000-0000-0000-000000000000"]);
    const cohortNameMap = new Map((cohorts ?? []).map((cohort) => [cohort.id, cohort.name as string]));

    return {
      data: (logs ?? []).map((l) => ({
        id: l.id,
        userId: l.user_id,
        email: l.email,
        fullName: nameMap.get(l.user_id) ?? null,
        actions: Array.isArray(l.actions) ? l.actions : [],
        actionCount: l.action_count,
        status: l.status,
        errorMessage: l.error_message,
        cohortName: l.cohort_id ? cohortNameMap.get(l.cohort_id) ?? null : null,
        scheduledFor: l.scheduled_for ?? null,
        reminderDate: l.reminder_date ?? null,
        createdAt: l.created_at,
      })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}
