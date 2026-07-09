"use server";

import { revalidatePath } from "next/cache";
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

    const nextRunAt = computeFirstRunAt(input);

    const { data, error } = await admin
      .from("email_schedules")
      .insert({
        name: input.name,
        template_id: input.template_id,
        user_ids: input.user_ids,
        schedule_type: input.schedule_type,
        interval_days:
          input.schedule_type === "every_n_days" ? (input.interval_days ?? 1) : null,
        run_time_utc: input.run_time_utc,
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
 * Useful for testing on the Vercel free plan where the cron only runs once a day.
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
