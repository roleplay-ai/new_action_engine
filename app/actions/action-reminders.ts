"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { istToUTCTime, utcToISTTime, IST_OFFSET_MINUTES, getCurrentISTDate } from "@/lib/timezone-utils";
import { syncMyTotalPointsFromHistory } from "@/app/actions/points";
import type { ActionReminder } from "@/lib/types";

/** Add N days to YYYY-MM-DD, return YYYY-MM-DD. */
function addDaysToISTDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if ([y, m, d].some(Number.isNaN)) return dateStr;
  const d0 = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  d0.setUTCDate(d0.getUTCDate() + days);
  const yy = d0.getUTCFullYear();
  const mm = String(d0.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d0.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Weekday in IST for date YYYY-MM-DD (0 = Sunday, 1 = Monday, ... 6 = Saturday). */
function getWeekdayIST(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  if ([y, m, d].some(Number.isNaN)) return 0;
  const utcMidnight = Date.UTC(y, m - 1, d, 0, 0, 0);
  const istMidnight = utcMidnight - IST_OFFSET_MINUTES * 60 * 1000;
  const utcDay = new Date(istMidnight).getUTCDay();
  return (utcDay + 1) % 7; // IST date's weekday: 0=Sun, 1=Mon, ..., 6=Sat
}

/** The Monday (YYYY-MM-DD, IST calendar) of the ISO week containing dateStr. */
function mondayOfWeekIST(dateStr: string): string {
  const dow = getWeekdayIST(dateStr); // 0=Sun..6=Sat
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  return addDaysToISTDate(dateStr, -daysSinceMonday);
}

/** Next Monday (YYYY-MM-DD, IST calendar) strictly after today, or today if today is Monday. */
function nextMondayIST(): string {
  const today = getCurrentISTDate();
  const dow = getWeekdayIST(today);
  const daysToAdd = dow === 1 ? 0 : (8 - dow) % 7 || 7;
  return dow === 1 ? today : addDaysToISTDate(today, daysToAdd);
}

/** Monday 00:00 IST of a given YYYY-MM-DD, as a UTC ISO timestamp. Guaranteed before the daily cron's run. */
function mondayMidnightISTAsUtcIso(mondayDateStr: string): string {
  const [y, m, d] = mondayDateStr.split("-").map(Number);
  const istMidnightUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0) - IST_OFFSET_MINUTES * 60 * 1000;
  return new Date(istMidnightUtcMs).toISOString();
}

export async function createActionReminder(params: {
  userActionId: string;
  actionId: string;
  timesPerWeek: number;
  timeOfDayIST: string;
}): Promise<{ error?: string; id?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { error: "Not authenticated" };
    }

    const { data: ua } = await supabase
      .from("user_actions")
      .select("id")
      .eq("id", params.userActionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!ua) {
      return { error: "User action not found" };
    }

    const timesPerWeek = Math.min(7, Math.max(1, Math.round(params.timesPerWeek)));
    const timeUTC = istToUTCTime(params.timeOfDayIST);
    const nextRunAt = mondayMidnightISTAsUtcIso(nextMondayIST());

    const { data, error } = await supabase
      .from("action_reminders")
      .upsert(
        {
          user_id: user.id,
          user_action_id: params.userActionId,
          action_id: params.actionId,
          times_per_week: timesPerWeek,
          time_of_day_utc: timeUTC,
          is_active: true,
          next_run_at: nextRunAt,
        },
        { onConflict: "user_action_id" }
      )
      .select("id")
      .single();

    if (error) return { error: error.message };
    revalidatePath("/");
    return { id: data.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function pauseActionReminder(id: string, isActive: boolean): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { error: "Not authenticated" };
    }

    const { error } = await supabase
      .from("action_reminders")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { error: error.message };
    revalidatePath("/");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteActionReminder(id: string): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { error: "Not authenticated" };
    }

    const { error } = await supabase
      .from("action_reminders")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { error: error.message };
    revalidatePath("/");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function getMyActionReminders(): Promise<{ reminders?: ActionReminder[]; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { error: "Not authenticated" };
    }

    const { data: rows, error } = await supabase
      .from("action_reminders")
      .select("id, user_action_id, action_id, times_per_week, time_of_day_utc, is_active, last_sent_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) return { error: error.message };

    const weekStart = mondayOfWeekIST(getCurrentISTDate());
    const reminderIds = (rows ?? []).map((r) => r.id);

    const doneSet = new Set<string>();
    if (reminderIds.length) {
      const { data: completions } = await supabase
        .from("action_reminder_completions")
        .select("reminder_id")
        .eq("week_start_date", weekStart)
        .in("reminder_id", reminderIds);
      for (const c of completions ?? []) doneSet.add(c.reminder_id as string);
    }

    const reminders: ActionReminder[] = (rows ?? []).map((r) => ({
      id: r.id,
      userActionId: r.user_action_id,
      actionId: r.action_id,
      timesPerWeek: r.times_per_week,
      timeOfDayIST: utcToISTTime(r.time_of_day_utc),
      isActive: r.is_active,
      lastSentAt: r.last_sent_at ?? undefined,
      doneThisWeek: doneSet.has(r.id),
    }));

    return { reminders };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Mark the current ISO week (IST) as done for a reminder. Idempotent per week. */
export async function markReminderWeekDone(reminderId: string): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { error: "Not authenticated" };
    }

    const { data: reminder } = await supabase
      .from("action_reminders")
      .select("id")
      .eq("id", reminderId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!reminder) {
      return { error: "Reminder not found" };
    }

    const weekStart = mondayOfWeekIST(getCurrentISTDate());
    const { error } = await supabase.from("action_reminder_completions").upsert(
      {
        reminder_id: reminderId,
        user_id: user.id,
        week_start_date: weekStart,
      },
      { onConflict: "reminder_id,week_start_date", ignoreDuplicates: true }
    );

    if (error) return { error: error.message };

    await syncMyTotalPointsFromHistory();
    revalidatePath("/");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}
