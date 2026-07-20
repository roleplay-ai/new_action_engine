/**
 * Daily/weekly action-reminder emails. Reuses each user's own plan cadence
 * (personal_action_subscriptions.track/days_of_week) — no separate email
 * schedule to configure. Runs once a day from the shared cron route (Vercel
 * free-tier only allows one daily cron), so this only fires on the IST
 * weekday(s) the user picked during onboarding, and only if they have actions
 * still pending (status = 'scheduled') — nothing to reminded about, no email.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateToUsers } from "@/lib/email-send";
import { getCurrentISTDate } from "@/lib/timezone-utils";
import { getWeekdayIST } from "@/lib/personal-action-generation";

export type ActionReminderRunSummary = {
  sent: number;
  failed: number;
  skippedEmpty: number;
};

export async function sendDailyActionReminders(
  baseUrl: string,
  fromEmail: string
): Promise<ActionReminderRunSummary> {
  const admin = createAdminClient();
  const todayIST = getCurrentISTDate();
  const todayWeekday = getWeekdayIST(todayIST);

  const { data: subs } = await admin
    .from("personal_action_subscriptions")
    .select("user_id, day_of_week, days_of_week, last_reminder_sent_date")
    .eq("is_active", true);

  const dueUserIds: string[] = [];
  const actionsByUser = new Map<
    string,
    { id: string; title: string; how: string; theme: string; timeEstimate: string }[]
  >();

  let skippedEmpty = 0;

  for (const sub of subs ?? []) {
    if (sub.last_reminder_sent_date === todayIST) continue; // already sent today
    const days = sub.days_of_week ?? (sub.day_of_week != null ? [sub.day_of_week] : null);
    if (!days?.includes(todayWeekday)) continue;

    const { data: uas } = await admin
      .from("user_actions")
      .select("action_id")
      .eq("user_id", sub.user_id)
      .eq("status", "scheduled");
    const actionIds = (uas ?? []).map((r) => r.action_id);
    if (!actionIds.length) {
      skippedEmpty += 1;
      continue;
    }

    const { data: actionRows } = await admin
      .from("actions")
      .select("id, title, how, theme, time_estimate")
      .in("id", actionIds);

    const actions = (actionRows ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      how: a.how,
      theme: a.theme,
      timeEstimate: a.time_estimate,
    }));
    if (!actions.length) {
      skippedEmpty += 1;
      continue;
    }

    dueUserIds.push(sub.user_id);
    actionsByUser.set(sub.user_id, actions);
  }

  if (!dueUserIds.length) {
    return { sent: 0, failed: 0, skippedEmpty };
  }

  const results = await sendTemplateToUsers({
    userIds: dueUserIds,
    templateId: "daily_reminder",
    fromEmail,
    baseUrl,
    sentBy: null,
    getPerUserTemplateData: async (userId) => ({
      actions: (actionsByUser.get(userId) ?? []).map((a) => ({
        theme: a.theme,
        title: a.title,
        how: a.how,
        timeEstimate: a.timeEstimate,
      })),
    }),
  });

  let sent = 0;
  let failed = 0;
  const nowDate = todayIST;

  for (const r of results) {
    const actions = actionsByUser.get(r.userId) ?? [];
    await admin.from("personal_action_reminder_logs").insert({
      user_id: r.userId,
      email: r.email,
      actions: actions.map((a) => ({ id: a.id, title: a.title, theme: a.theme })),
      action_count: actions.length,
      status: r.success ? "sent" : "failed",
      error_message: r.error ?? null,
    });

    if (r.success) {
      sent += 1;
      await admin
        .from("personal_action_subscriptions")
        .update({ last_reminder_sent_date: nowDate })
        .eq("user_id", r.userId);
    } else {
      failed += 1;
    }
  }

  return { sent, failed, skippedEmpty };
}
