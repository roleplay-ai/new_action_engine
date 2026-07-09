import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSendGridConfigured } from "@/lib/sendgrid";
import { sendTemplateToUsers } from "@/lib/email-send";
import { type ScheduleType } from "@/app/actions/email-schedule";
import { computeNextRunAt } from "@/lib/schedule-utils";
import { buildWeeklyEmailTemplateDataForUser } from "@/lib/weekly-email";
import { getDueRemindersByUser, buildActionReminderTemplateData } from "@/lib/action-reminder-email";

/**
 * Vercel Cron handler — runs once daily (see vercel.json for the exact cron expression).
 * Picks up all active email_schedules where next_run_at <= now, sends via SendGrid,
 * then advances (or deactivates) each schedule. Also picks up due personal
 * action_reminders (one summary email per user, grouping all their due reminders),
 * then advances each reminder's next_run_at by 7 days.
 *
 * Auth: checks Authorization: Bearer <CRON_SECRET> header (set by Vercel
 * automatically when CRON_SECRET env var is present) or ?secret= query param
 * for local testing.
 */
export async function GET(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const authHeader = request.headers.get("authorization");
    const querySecret = new URL(request.url).searchParams.get("secret");
    const bearerToken = authHeader?.replace("Bearer ", "");

    if (bearerToken !== expected && querySecret !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isSendGridConfigured()) {
    return NextResponse.json(
      { error: "SendGrid not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL missing)" },
      { status: 500 }
    );
  }

  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000";
  const fromEmail = process.env.SENDGRID_FROM_EMAIL!;

  // ── Fetch due schedules ─────────────────────────────────────────────────────
  const { data: schedules, error: fetchError } = await admin
    .from("email_schedules")
    .select("*")
    .eq("is_active", true)
    .lte("next_run_at", nowIso);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const summary: {
    scheduleId: string;
    name: string;
    sent: number;
    failed: number;
    nextRunAt: string | null;
  }[] = [];

  for (const schedule of schedules ?? []) {
    const userIds: string[] = schedule.user_ids ?? [];
    const scheduleType = String(schedule.schedule_type ?? "").toLowerCase();

    const debugEmail = (() => {
      const v = (process.env.EMAIL_DEBUG_LOG ?? "").trim().toLowerCase();
      return v === "1" || v === "true" || v === "yes" || v === "on";
    })();

    if (debugEmail) {
      console.log("[email-scheduler] running schedule", {
        scheduleId: schedule.id,
        name: schedule.name,
        scheduleType,
        templateId: schedule.template_id,
        userCount: userIds.length,
        nextRunAt: schedule.next_run_at,
      });
    }

    let sent = 0;
    let failed = 0;

    if (userIds.length > 0) {
      const results = await sendTemplateToUsers({
        userIds,
        templateId: schedule.template_id,
        fromEmail,
        baseUrl,
        sentBy: null, // automated, no human sender
        getPerUserTemplateData:
          scheduleType === "weekly" || scheduleType === "specific_date"
            ? async (userId) => {
                const data = await buildWeeklyEmailTemplateDataForUser(userId, { baseUrl });
                return data as unknown as Record<string, unknown>;
              }
            : undefined,
      });

      sent = results.filter((r) => r.success).length;
      failed = results.filter((r) => !r.success).length;
    }

    // ── Advance schedule ──────────────────────────────────────────────────────
    const currentNextRun = new Date(schedule.next_run_at);
    const nextRunDate = computeNextRunAt(
      scheduleType as ScheduleType,
      currentNextRun,
      schedule.interval_days
    );

    const isOneTime = scheduleType === "specific_date";
    const nextRunAt = nextRunDate ? nextRunDate.toISOString() : schedule.next_run_at;
    const runStatus =
      failed === 0 ? "success" : sent === 0 ? "failed" : "partial";

    await admin
      .from("email_schedules")
      .update({
        last_run_at: nowIso,
        last_run_status: runStatus,
        last_run_sent: sent,
        last_run_failed: failed,
        next_run_at: nextRunAt,
        is_active: !isOneTime, // deactivate one-time schedules after firing
        updated_at: nowIso,
      })
      .eq("id", schedule.id);

    summary.push({
      scheduleId: schedule.id,
      name: schedule.name,
      sent,
      failed,
      nextRunAt: isOneTime ? null : nextRunAt,
    });
  }

  // ── Personal action reminders (weekly, one email per user) ─────────────────
  const reminderTemplateId = process.env.SENDGRID_ACTION_REMINDER_TEMPLATE_ID;
  let remindersProcessed = 0;
  if (reminderTemplateId) {
    const dueByUser = await getDueRemindersByUser(nowIso);

    for (const [userId, dueRows] of dueByUser) {
      const templateData = await buildActionReminderTemplateData(userId, dueRows, { baseUrl });
      if (!templateData.actions.length) continue;

      const results = await sendTemplateToUsers({
        userIds: [userId],
        templateId: reminderTemplateId,
        fromEmail,
        baseUrl,
        sentBy: null,
        extraTemplateData: templateData as unknown as Record<string, unknown>,
      });

      const sent = results.some((r) => r.success);

      for (const row of dueRows) {
        const nextRunAt = new Date(row.next_run_at);
        nextRunAt.setUTCDate(nextRunAt.getUTCDate() + 7);
        await admin
          .from("action_reminders")
          .update({
            last_sent_at: nowIso,
            next_run_at: nextRunAt.toISOString(),
            updated_at: nowIso,
          })
          .eq("id", row.id);
      }

      if (sent) remindersProcessed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    processed: (schedules ?? []).length,
    results: summary,
    remindersProcessed,
  });
}
