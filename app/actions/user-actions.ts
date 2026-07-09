"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { istToUTCDateTime, IST_OFFSET_MINUTES, getCurrentISTDate } from "@/lib/timezone-utils";
import { getPointsForEvent } from "@/lib/points";
import { sgMail, isSendGridConfigured } from "@/lib/sendgrid";
import { buildMeetingInviteIcs } from "@/lib/ics-invite";

function toGoogleCalendarTemplateUrl(params: {
  text: string;
  details: string;
  startUtcIso: string;
  endUtcIso: string;
}): string {
  const fmt = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const dates = `${fmt(params.startUtcIso)}/${fmt(params.endUtcIso)}`;
  const u = new URL("https://calendar.google.com/calendar/render");
  u.searchParams.set("action", "TEMPLATE");
  u.searchParams.set("text", params.text);
  u.searchParams.set("details", params.details);
  u.searchParams.set("dates", dates);
  return u.toString();
}

async function addPointsToProfile(userId: string, delta: number): Promise<void> {
  if (!delta) return;
  const supabase = await createClient();
  const { data: prof } = await supabase.from("profiles").select("total_points").eq("id", userId).single();
  if (!prof) return;
  await supabase
    .from("profiles")
    .update({
      total_points: Math.max(0, (prof.total_points || 0) + delta),
      last_active_at: new Date().toISOString(),
    })
    .eq("id", userId);
}

/** Debug: Get current IST date and time for troubleshooting */
export async function debugCurrentISTTime(): Promise<{
  serverUTC: string;
  istDate: string;
  istTime: string;
}> {
  const now = new Date();
  const istNow = new Date(now.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  const istDate = `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth() + 1).padStart(2, "0")}-${String(istNow.getUTCDate()).padStart(2, "0")}`;
  const istTime = `${String(istNow.getUTCHours()).padStart(2, "0")}:${String(istNow.getUTCMinutes()).padStart(2, "0")}`;

  return {
    serverUTC: now.toISOString(),
    istDate,
    istTime,
  };
}

/**
 * Build scheduled_at ISO string from an explicit IST date (YYYY-MM-DD) + time (HH:MM).
 * Converts IST input to UTC for storage.
 */
function toScheduledAt(dateIST: string, timeIST: string): string {
  // Basic validation; fallback to today's IST date if malformed.
  const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test((dateIST ?? "").trim());
  const safeDate = isValidDate ? dateIST : getCurrentISTDate();
  return istToUTCDateTime(safeDate, timeIST);
}

/** Add N days to YYYY-MM-DD, return YYYY-MM-DD (for IST date arithmetic). */
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

/** Next occurrence of weekday (0–6) on or after dateStr. Returns YYYY-MM-DD. */
function getNextOrSameWeekday(dateStr: string, weekday: number): string {
  const cur = getWeekdayIST(dateStr);
  const daysToAdd = (weekday - cur + 7) % 7;
  return addDaysToISTDate(dateStr, daysToAdd);
}

/**
 * Schedule habit loop: insert 4 habit_occurrences for the next 4 reps.
 * - daily: next 4 days at chosen time each day.
 * - weekly: next 4 occurrences of chosen weekday at chosen time.
 */
export async function scheduleHabitLoop(params: {
  userActionId: string;
  track: "daily" | "weekly";
  timeIST?: string;
  /** For weekly: 0 = Sunday, 1 = Monday, ... 6 = Saturday. */
  weekdayIST?: number;
}): Promise<{ error?: string }> {
  const { userActionId, track, timeIST: timeISTParam, weekdayIST } = params;
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Not authenticated" };
  }

  const { data: ua, error: fetchError } = await supabase
    .from("user_actions")
    .select("id, user_id, action_id, status, scheduled_at, accepted_at")
    .eq("id", userActionId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !ua) {
    return { error: "User action not found" };
  }

  if (ua.status !== "habit_started") {
    return { error: "Action is not in habit loop" };
  }

  // Prefer passed time; else from scheduled_at or accepted_at (IST); else 09:00 IST
  let timeIST = timeISTParam ?? "09:00";
  if (!timeISTParam && (ua.scheduled_at || ua.accepted_at)) {
    const ref = ua.scheduled_at ?? ua.accepted_at;
    const date = new Date(ref);
    const ist = new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
    const h = String(ist.getUTCHours()).padStart(2, "0");
    const m = String(ist.getUTCMinutes()).padStart(2, "0");
    timeIST = `${h}:${m}`;
  }
  if (!timeIST.includes(":")) timeIST = "09:00";

  const todayIST = getCurrentISTDate();
  const scheduledAts: string[] = [];

  if (track === "daily") {
    for (let i = 1; i <= 4; i++) {
      const dateStr = addDaysToISTDate(todayIST, i);
      scheduledAts.push(istToUTCDateTime(dateStr, timeIST));
    }
  } else {
    const w = typeof weekdayIST === "number" && weekdayIST >= 0 && weekdayIST <= 6 ? weekdayIST : getWeekdayIST(todayIST);
    const firstDate = getNextOrSameWeekday(todayIST, w);
    for (let i = 0; i < 4; i++) {
      const dateStr = addDaysToISTDate(firstDate, i * 7);
      scheduledAts.push(istToUTCDateTime(dateStr, timeIST));
    }
  }

  for (const scheduledAt of scheduledAts) {
    const { error: insertError } = await supabase.from("habit_occurrences").insert({
      user_id: user.id,
      action_id: ua.action_id,
      user_action_id: ua.id,
      scheduled_at: scheduledAt,
    });
    if (insertError) {
      console.error(insertError);
      return { error: insertError.message };
    }
  }

  revalidatePath("/");
  return {};
}

export async function scheduleAction(params: {
  actionId: string;
  /** IST date in YYYY-MM-DD (from date picker). */
  day: string;
  time: string;
  sync: boolean;
}): Promise<{
  error?: string;
}> {
  const { actionId, day, time, sync } = params;
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Not authenticated" };
  }

  const { data: actionRow, error: actionFetchError } = await supabase
    .from("actions")
    .select("title, how, why, theme")
    .eq("id", actionId)
    .single();

  if (actionFetchError || !actionRow) {
    return { error: actionFetchError?.message ?? "Action not found" };
  }

  const scheduledAt = toScheduledAt(day, time);
  const scheduledEndAt = new Date(new Date(scheduledAt).getTime() + 5 * 60 * 1000).toISOString();
  const acceptedAt = new Date().toISOString();
  const { data: existingUa } = await supabase
    .from("user_actions")
    .select("status")
    .eq("user_id", user.id)
    .eq("action_id", actionId)
    .maybeSingle();

  // Debug logging
  console.log('[scheduleAction] Input:', { day, time });
  console.log('[scheduleAction] Calculated scheduled_at (UTC):', scheduledAt);
  console.log('[scheduleAction] Server UTC time:', new Date().toISOString());

  const { error: upsertError } = await supabase.from("user_actions").upsert(
    {
      user_id: user.id,
      action_id: actionId,
      status: "scheduled",
      scheduled_at: scheduledAt,
      accepted_at: acceptedAt,
      completed_reps: 0,
      reps_remaining: null,
      is_calendar_synced: sync,
    },
    { onConflict: "user_id,action_id" }
  );

  if (upsertError) {
    console.error(upsertError);
    return { error: upsertError.message };
  }

  // Accept points are one-time per action.
  const alreadyAccepted =
    existingUa?.status === "scheduled" ||
    existingUa?.status === "success" ||
    existingUa?.status === "habit_started" ||
    existingUa?.status === "cemented" ||
    existingUa?.status === "failed";
  if (!alreadyAccepted) {
    await addPointsToProfile(user.id, getPointsForEvent("accept", sync));
  }
  if (!existingUa) {
    await addPointsToProfile(user.id, getPointsForEvent("read"));
  }

  // Emit feed event
  await supabase.from("feed_events").insert({
    user_id: user.id,
    action_title: actionRow.title,
    type: "ACCEPTED",
  });

  // Email calendar invite (bypasses Google Calendar OAuth; user can add in Gmail/Calendar).
  if (sync && isSendGridConfigured() && user.email) {
    try {
      const fromEmail = process.env.SENDGRID_FROM_EMAIL!;
      const templateId = "d-31fc8012ccbd42fda00234ed3c3445df";
      const summary = actionRow.title;
      const description = `How:\n${actionRow.how}\n\nWhy:\n${actionRow.why}`;
      const addToCalendarUrl = toGoogleCalendarTemplateUrl({
        text: summary,
        details: description,
        startUtcIso: scheduledAt,
        endUtcIso: scheduledEndAt,
      });

      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, company_id")
        .eq("id", user.id)
        .maybeSingle();

      const firstName =
        (prof?.full_name ?? "").trim().split(/\s+/)[0] || user.email.split("@")[0] || "there";

      let companyName: string | null = null;
      if (prof?.company_id) {
        const { data: company } = await supabase
          .from("companies")
          .select("name")
          .eq("id", prof.company_id)
          .maybeSingle();
        companyName = (company as any)?.name ?? null;
      }

      const ics = buildMeetingInviteIcs({
        uid: `${randomUUID()}@nudgeable.ai`,
        organizerEmail: fromEmail,
        attendeeEmail: user.email,
        summary,
        description,
        startUtcIso: scheduledAt,
        endUtcIso: scheduledEndAt,
      });

      const baseMessage = {
        to: user.email,
        from: { email: fromEmail, name: "Nudgeable" },
        attachments: [
          {
            content: Buffer.from(ics, "utf8").toString("base64"),
            filename: "invite.ics",
            type: "text/calendar",
            disposition: "attachment",
          },
        ],
      } as const;

      await sgMail.send({
        ...baseMessage,
        templateId,
        dynamicTemplateData: {
          company_name: companyName ?? "",
          first_name: firstName,
          skill: actionRow.theme ?? "",
          what: summary,
          how: actionRow.how,
          why: actionRow.why,
          add_to_calendar_url: addToCalendarUrl,
        },
      } as any);
    } catch (e) {
      const err = e as any;
      console.error("[scheduleAction] failed sending invite email", {
        message: err?.message,
        code: err?.code,
        sendgridErrors: err?.response?.body?.errors,
        responseBody: err?.response?.body,
      });
    }
  }

  revalidatePath("/");
  return {};
}

/** Accept action without picking a time ("I'll do it whenever"). Goes to validation queue with "Accepted on ...". */
export async function acceptActionWithoutSchedule(actionId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Not authenticated" };
  }

  const acceptedAt = new Date().toISOString();
  const { data: existingUa } = await supabase
    .from("user_actions")
    .select("status")
    .eq("user_id", user.id)
    .eq("action_id", actionId)
    .maybeSingle();

  const { error: upsertError } = await supabase.from("user_actions").upsert(
    {
      user_id: user.id,
      action_id: actionId,
      status: "scheduled",
      scheduled_at: null,
      accepted_at: acceptedAt,
      completed_reps: 0,
      reps_remaining: null,
      is_calendar_synced: false,
    },
    { onConflict: "user_id,action_id" }
  );

  if (upsertError) {
    console.error(upsertError);
    return { error: upsertError.message };
  }

  // Accept points are one-time per action.
  const alreadyAccepted =
    existingUa?.status === "scheduled" ||
    existingUa?.status === "success" ||
    existingUa?.status === "habit_started" ||
    existingUa?.status === "cemented" ||
    existingUa?.status === "failed";
  if (!alreadyAccepted) {
    await addPointsToProfile(user.id, getPointsForEvent("accept", false));
  }
  if (!existingUa) {
    await addPointsToProfile(user.id, getPointsForEvent("read"));
  }

  const { data: action } = await supabase.from("actions").select("title").eq("id", actionId).single();
  if (action) {
    await supabase.from("feed_events").insert({
      user_id: user.id,
      action_title: action.title,
      type: "ACCEPTED",
    });
  }

  revalidatePath("/");
  return {};
}

export async function declineAction(actionId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Not authenticated" };
  }

  const { data: existingUa } = await supabase
    .from("user_actions")
    .select("status")
    .eq("user_id", user.id)
    .eq("action_id", actionId)
    .maybeSingle();

  const { error: upsertError } = await supabase.from("user_actions").upsert(
    {
      user_id: user.id,
      action_id: actionId,
      status: "skipped",
      completed_reps: 0,
      reps_remaining: null,
    },
    { onConflict: "user_id,action_id" }
  );

  if (upsertError) {
    return { error: upsertError.message };
  }

  // Decline points are one-time per action.
  if (existingUa?.status !== "skipped") {
    await addPointsToProfile(user.id, getPointsForEvent("honesty_skip"));
  }
  if (!existingUa) {
    await addPointsToProfile(user.id, getPointsForEvent("read"));
  }

  const { data: action } = await supabase.from("actions").select("title").eq("id", actionId).single();
  if (action) {
    await supabase.from("feed_events").insert({
      user_id: user.id,
      action_title: action.title,
      type: "DECLINED",
    });
  }

  revalidatePath("/");
  return {};
}
