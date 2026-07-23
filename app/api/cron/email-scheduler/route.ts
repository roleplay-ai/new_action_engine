import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResendConfigured } from "@/lib/resend";
import { sendTemplateToUsers } from "@/lib/email-send";
import { type ScheduleType } from "@/app/actions/email-schedule";
import { computeNextRunAtAfter } from "@/lib/schedule-utils";
import { buildWeeklyEmailTemplateDataForUser } from "@/lib/weekly-email";
import { getDueSubscriptions, assignScheduledBatch } from "@/lib/personal-action-generation";
import { sendDailyActionReminders } from "@/lib/action-reminders";

/**
 * Shared cron handler — runs once daily at 11:30 AM IST / 06:00 UTC
 * on Vercel's free cron allowance (see vercel.json).
 * Picks up all active email_schedules where next_run_at <= now, sends via Resend,
 * then advances (or deactivates) each schedule. Also picks up due
 * personal_action_subscriptions and assigns the next batch of already-generated
 * personal actions into "My Actions" (in-app only, no email), then advances
 * next_delivery_at by the subscription's frequency. Finally sends per-user
 * action-reminder emails on each participant's chosen day at the fixed cron time
 * (see lib/action-reminders.ts) — a separate concept from email_schedules,
 * which is admin-configured broadcasts to explicitly chosen recipients.
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

  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  // ── Personal action delivery (in-app, no email required) ───────────────────
  const dueSubscriptions = await getDueSubscriptions(nowIso);
  let subscriptionsDelivered = 0;
  for (const sub of dueSubscriptions) {
    const { assigned } = await assignScheduledBatch(sub);
    if (assigned > 0) subscriptionsDelivered += 1;
  }

  // ── Email schedules (require Resend) ────────────────────────────────────────
  if (!isResendConfigured()) {
    return NextResponse.json({
      ok: true,
      message: "Resend not configured — skipped email_schedules and reminders, personal actions still processed",
      processed: 0,
      results: [],
      subscriptionsDelivered,
      reminders: {
        sent: 0,
        failed: 0,
        skippedEmpty: 0,
        skippedNotDue: 0,
        skippedDisabled: 0,
        skippedClaimed: 0,
      },
    });
  }
  const fromEmail = process.env.RESEND_FROM_EMAIL!;

  // ── Per-user action-reminder emails (own plan cadence, not admin-scheduled) ─
  const reminderSummary = await sendDailyActionReminders(baseUrl, fromEmail);

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
    const { data: claimed, error: claimError } = await admin.rpc(
      "claim_due_email_schedule",
      { p_schedule_id: schedule.id, p_now: nowIso }
    );
    if (claimError) {
      console.error("[email-scheduler] failed to claim schedule", {
        scheduleId: schedule.id,
        error: claimError.message,
      });
      continue;
    }
    if (!claimed) continue;

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
        includeStoredCredentials: schedule.template_id === "credentials",
        getPerUserTemplateData:
          schedule.template_id === "weekly_challenges"
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
    const nextRunDate = computeNextRunAtAfter(
      scheduleType as ScheduleType,
      currentNextRun,
      now,
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
        processing_started_at: null,
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
    processed: (schedules ?? []).length,
    results: summary,
    subscriptionsDelivered,
    reminders: reminderSummary,
  });
}
