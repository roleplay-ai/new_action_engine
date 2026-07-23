"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResendConfigured } from "@/lib/resend";
import { sendTemplateToUsers } from "@/lib/email-send";
import { computeNextRunAtAfter } from "@/lib/schedule-utils";
import { buildWeeklyEmailTemplateDataForUser } from "@/lib/weekly-email";

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

  return user.id;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScheduleType =
  | "daily"
  | "weekly"
  | "every_n_days"
  | "specific_date";

export type EmailSchedule = {
  id: string;
  name: string;
  template_id: string;
  user_ids: string[];
  schedule_type: ScheduleType;
  interval_days: number | null;
  run_time_utc: string;
  specific_run_at: string | null;
  next_run_at: string;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_sent: number;
  last_run_failed: number;
  is_active: boolean;
  created_at: string;
};

export type CreateScheduleInput = {
  name: string;
  template_id: string;
  user_ids: string[];
  schedule_type: ScheduleType;
  interval_days?: number;    // only for every_n_days
  run_time_utc: string;      // HH:MM in UTC, used for all recurring types
  specific_run_at?: string;  // ISO datetime string, only for specific_date
};

export type BulkRunScheduleResult = {
  scheduleId: string;
  name: string;
  sent: number;
  failed: number;
  nextRunAt: string | null;
  status: "sent" | "partial" | "failed" | "skipped";
  error?: string;
};

const FREE_CRON_RUN_TIME_UTC = "06:00"; // 11:30 AM IST

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute when the schedule should first fire.
 * For recurring types, if today's slot has already passed we push to the next cycle.
 */
function computeFirstRunAt(input: CreateScheduleInput): Date {
  if (input.schedule_type === "specific_date") {
    return new Date(input.specific_run_at!);
  }

  const now = new Date();
  const [h, m] = input.run_time_utc.split(":").map(Number);

  // Start from today at the requested time (UTC)
  const candidate = new Date(now);
  candidate.setUTCHours(h, m, 0, 0);

  // Weekly schedules are anchored to Monday (per product requirement).
  if (input.schedule_type === "weekly") {
    const targetDow = 1; // Monday (UTC)
    const currentDow = candidate.getUTCDay();
    let deltaDays = (targetDow - currentDow + 7) % 7;
    if (deltaDays === 0 && candidate <= now) deltaDays = 7;
    if (deltaDays !== 0) candidate.setUTCDate(candidate.getUTCDate() + deltaDays);
    return candidate;
  }

  if (candidate <= now) {
    // Time already passed today → advance by one cycle
    const daysToAdd =
      input.schedule_type === "every_n_days"
        ? (input.interval_days ?? 1)
        : 1; // daily
    candidate.setUTCDate(candidate.getUTCDate() + daysToAdd);
  }

  return candidate;
}

// ─── Server actions ───────────────────────────────────────────────────────────

export async function createEmailSchedule(
  input: CreateScheduleInput
): Promise<{ data?: EmailSchedule; error?: string }> {
  try {
    const createdBy = await ensureSuperadmin();
    const admin = createAdminClient();

    const normalizedInput =
      input.schedule_type === "specific_date"
        ? input
        : { ...input, run_time_utc: FREE_CRON_RUN_TIME_UTC };
    const nextRunAt = computeFirstRunAt(normalizedInput);

    const { data, error } = await admin
      .from("email_schedules")
      .insert({
        name: input.name,
        template_id: input.template_id,
        user_ids: input.user_ids,
        schedule_type: input.schedule_type,
        interval_days:
          input.schedule_type === "every_n_days" ? (input.interval_days ?? 1) : null,
        run_time_utc: normalizedInput.run_time_utc,
        specific_run_at:
          input.schedule_type === "specific_date" ? input.specific_run_at : null,
        next_run_at: nextRunAt.toISOString(),
        is_active: true,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) return { error: error.message };

    revalidatePath("/superadmin/users");
    return { data: data as EmailSchedule };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function getEmailSchedules(): Promise<
  { data: EmailSchedule[] } | { error: string }
> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("email_schedules")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return { error: error.message };
    return { data: (data ?? []) as EmailSchedule[] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function toggleEmailSchedule(
  id: string,
  isActive: boolean
): Promise<{ ok?: boolean; error?: string }> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const { error } = await admin
      .from("email_schedules")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return { error: error.message };
    revalidatePath("/superadmin/users");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteEmailSchedule(
  id: string
): Promise<{ ok?: boolean; error?: string }> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const { error } = await admin
      .from("email_schedules")
      .delete()
      .eq("id", id);

    if (error) return { error: error.message };
    revalidatePath("/superadmin/users");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/**
 * Manually trigger the email scheduler cron handler right now.
 * Useful for testing a schedule immediately without waiting for the next cron check.
 */
export async function runEmailSchedulerNow(): Promise<{
  ok?: boolean;
  processed?: number;
  results?: { name: string; sent: number; failed: number }[];
  error?: string;
}> {
  try {
    await ensureSuperadmin();

    const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const isLikelyLocal =
      process.env.VERCEL !== "1" && process.env.NODE_ENV !== "production";
    // In local dev, NEXT_PUBLIC_APP_URL is often set to the deployed URL.
    // For "Run now" we want local logs + local env, so prefer localhost.
    const baseUrl =
      isLikelyLocal && configuredBaseUrl.includes("vercel.app")
        ? "http://localhost:3000"
        : configuredBaseUrl || "http://localhost:3000";
    const secret = process.env.CRON_SECRET;
    const url = `${baseUrl}/api/cron/email-scheduler${secret ? `?secret=${secret}` : ""}`;

    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      const msg =
        (data && typeof data.error === "string" && data.error) ||
        (text?.trim() ? text.trim() : `Scheduler returned ${res.status}`);
      return { error: msg };
    }
    return { ok: true, processed: data?.processed, results: data?.results };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to trigger scheduler" };
  }
}

/**
 * Send selected active schedules immediately, even when their next run is in
 * the future. The selected occurrence is consumed: recurring schedules advance
 * to their following slot and one-time schedules are completed.
 */
export async function bulkRunEmailSchedulesNow(
  scheduleIds: string[]
): Promise<{
  ok?: boolean;
  processed?: number;
  results?: BulkRunScheduleResult[];
  error?: string;
}> {
  try {
    await ensureSuperadmin();

    const uniqueIds = Array.from(
      new Set(scheduleIds.filter((id) => typeof id === "string" && id.trim()))
    );
    if (uniqueIds.length === 0) {
      return { error: "Select at least one upcoming email schedule." };
    }
    if (!isResendConfigured()) {
      return {
        error:
          "Email sending is not configured. Add RESEND_API_KEY and RESEND_FROM_EMAIL.",
      };
    }

    const admin = createAdminClient();
    const { data: schedules, error: fetchError } = await admin
      .from("email_schedules")
      .select("*")
      .in("id", uniqueIds)
      .eq("is_active", true)
      .order("next_run_at", { ascending: true });

    if (fetchError) return { error: fetchError.message };
    if (!schedules?.length) {
      return { error: "The selected schedules are no longer active." };
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL!;
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");
    const results: BulkRunScheduleResult[] = [];

    for (const schedule of schedules) {
      const now = new Date();
      const nowIso = now.toISOString();
      const { data: claimed, error: claimError } = await admin.rpc(
        "claim_email_schedule_for_manual_run",
        { p_schedule_id: schedule.id, p_now: nowIso }
      );

      if (claimError) {
        results.push({
          scheduleId: schedule.id,
          name: schedule.name,
          sent: 0,
          failed: 0,
          nextRunAt: schedule.next_run_at,
          status: "failed",
          error: claimError.message,
        });
        continue;
      }
      if (!claimed) {
        results.push({
          scheduleId: schedule.id,
          name: schedule.name,
          sent: 0,
          failed: 0,
          nextRunAt: schedule.next_run_at,
          status: "skipped",
          error: "Already running, paused, or completed.",
        });
        continue;
      }

      try {
        const userIds: string[] = schedule.user_ids ?? [];
        const sendResults = await sendTemplateToUsers({
          userIds,
          templateId: schedule.template_id,
          fromEmail,
          baseUrl,
          sentBy: null,
          includeStoredCredentials: schedule.template_id === "credentials",
          getPerUserTemplateData:
            schedule.template_id === "weekly_challenges"
              ? async (userId) => {
                  const data = await buildWeeklyEmailTemplateDataForUser(userId, {
                    baseUrl,
                  });
                  return data as unknown as Record<string, unknown>;
                }
              : undefined,
        });

        const sent = sendResults.filter((result) => result.success).length;
        const failed = sendResults.filter((result) => !result.success).length;
        const scheduleType = String(
          schedule.schedule_type ?? ""
        ).toLowerCase() as ScheduleType;
        const nextRunDate = computeNextRunAtAfter(
          scheduleType,
          new Date(schedule.next_run_at),
          now,
          schedule.interval_days
        );
        const isOneTime = scheduleType === "specific_date";
        const nextRunAt = nextRunDate?.toISOString() ?? schedule.next_run_at;
        const runStatus =
          failed === 0 ? "success" : sent === 0 ? "failed" : "partial";

        const { error: updateError } = await admin
          .from("email_schedules")
          .update({
            last_run_at: nowIso,
            last_run_status: runStatus,
            last_run_sent: sent,
            last_run_failed: failed,
            next_run_at: nextRunAt,
            is_active: !isOneTime,
            processing_started_at: null,
            updated_at: nowIso,
          })
          .eq("id", schedule.id);

        if (updateError) throw updateError;

        results.push({
          scheduleId: schedule.id,
          name: schedule.name,
          sent,
          failed,
          nextRunAt: isOneTime ? null : nextRunAt,
          status:
            failed === 0 ? "sent" : sent === 0 ? "failed" : "partial",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to send schedule";
        await admin
          .from("email_schedules")
          .update({
            last_run_at: nowIso,
            last_run_status: "failed",
            last_run_sent: 0,
            last_run_failed: (schedule.user_ids ?? []).length,
            processing_started_at: null,
            updated_at: nowIso,
          })
          .eq("id", schedule.id);

        results.push({
          scheduleId: schedule.id,
          name: schedule.name,
          sent: 0,
          failed: (schedule.user_ids ?? []).length,
          nextRunAt: schedule.next_run_at,
          status: "failed",
          error: message,
        });
      }
    }

    revalidatePath("/superadmin/emails");
    return { ok: true, processed: results.length, results };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to run email schedules",
    };
  }
}

export async function updateEmailScheduleUsers(
  id: string,
  userIds: string[]
): Promise<{ ok?: boolean; error?: string }> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const { error } = await admin
      .from("email_schedules")
      .update({ user_ids: userIds, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return { error: error.message };
    revalidatePath("/superadmin/users");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}
