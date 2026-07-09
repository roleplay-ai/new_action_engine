import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSendGridConfigured } from "@/lib/sendgrid";
import { sendTemplateToUsers } from "@/lib/email-send";
import { type ScheduleType } from "@/app/actions/email-schedule";
import { computeNextRunAt } from "@/lib/schedule-utils";
import { buildWeeklyEmailTemplateDataForUser } from "@/lib/weekly-email";

/**
 * Vercel Cron handler — runs every hour (see vercel.json).
 * Picks up all active email_schedules where next_run_at <= now,
 * sends via SendGrid, then advances (or deactivates) each schedule.
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

  if (!schedules || schedules.length === 0) {
    return NextResponse.json({ ok: true, message: "No schedules due", processed: 0 });
  }

  const summary: {
    scheduleId: string;
    name: string;
    sent: number;
    failed: number;
    nextRunAt: string | null;
  }[] = [];

  for (const schedule of schedules) {
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

  return NextResponse.json({
    ok: true,
    processed: schedules.length,
    results: summary,
  });
}
