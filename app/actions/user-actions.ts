"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { istToUTCDateTime, IST_OFFSET_MINUTES, getCurrentISTDate } from "@/lib/timezone-utils";
import { getPointsForEvent } from "@/lib/points";
import { isResendConfigured, resend } from "@/lib/resend";
import { renderEmailTemplate } from "@/lib/email-templates";
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
  if (sync && isResendConfigured() && user.email) {
    try {
      const fromEmail = process.env.RESEND_FROM_EMAIL!;
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

      const { subject, html } = renderEmailTemplate("calendar_invite", {
        company_name: companyName ?? "",
        first_name: firstName,
        skill: actionRow.theme ?? "",
        what: summary,
        how: actionRow.how,
        why: actionRow.why,
        add_to_calendar_url: addToCalendarUrl,
      });

      const { error: sendError } = await resend.emails.send({
        to: user.email,
        from: `Nudgeable <${fromEmail}>`,
        subject,
        html,
        attachments: [
          {
            filename: "invite.ics",
            content: Buffer.from(ics, "utf8"),
          },
        ],
      });
      if (sendError) throw new Error(sendError.message);
    } catch (e) {
      const err = e as any;
      console.error("[scheduleAction] failed sending invite email", {
        message: err?.message,
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

/** Mark an action complete in one step — no scheduling. Creates or updates user_actions with success/failed. */
export async function completeAction(params: {
  actionId: string;
  success: boolean;
  reflection?: string;
}): Promise<{ error?: string }> {
  const { actionId, success, reflection } = params;
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Not authenticated" };
  }

  const { data: actionRow } = await supabase
    .from("actions")
    .select("title")
    .eq("id", actionId)
    .single();

  const { data: existingUa } = await supabase
    .from("user_actions")
    .select("status")
    .eq("user_id", user.id)
    .eq("action_id", actionId)
    .maybeSingle();

  const acceptedAt = new Date().toISOString();
  const newStatus = success ? "success" : "failed";

  const { error: upsertError } = await supabase.from("user_actions").upsert(
    {
      user_id: user.id,
      action_id: actionId,
      status: newStatus,
      scheduled_at: null,
      accepted_at: acceptedAt,
      reflection: reflection || null,
      is_calendar_synced: false,
    },
    { onConflict: "user_id,action_id" }
  );

  if (upsertError) {
    return { error: upsertError.message };
  }

  const alreadyAccepted =
    existingUa?.status === "scheduled" ||
    existingUa?.status === "success" ||
    existingUa?.status === "failed";

  if (!existingUa) {
    await addPointsToProfile(user.id, getPointsForEvent("read"));
    await addPointsToProfile(user.id, getPointsForEvent("accept", false));
  } else if (!alreadyAccepted) {
    await addPointsToProfile(user.id, getPointsForEvent("accept", false));
  }

  if (success) {
    await addPointsToProfile(user.id, getPointsForEvent("success"));
    if (actionRow?.title) {
      await supabase.from("feed_events").insert({
        user_id: user.id,
        action_title: actionRow.title,
        type: "SUCCESS",
      });
    }
  } else if (existingUa?.status !== "failed") {
    await addPointsToProfile(user.id, getPointsForEvent("inaction"));
  }

  revalidatePath("/");
  return {};
}
