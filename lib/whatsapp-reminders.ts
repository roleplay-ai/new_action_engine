/**
 * WhatsApp action reminders — Phase 4 of docs/WHATSAPP_REMINDERS_PLAN.md.
 *
 * Runs from the same daily cron as the reminder email
 * (app/api/cron/email-scheduler/route.ts) and mirrors it exactly:
 *   - same plans: active, unarchived, linked to a batch;
 *   - same days: reminderDaysFor() (weekdays on daily, chosen day on weekly);
 *   - same actions: the plan's current ("scheduled") actions for that batch,
 *     via buildReminderActionContext().
 * On top of that a plan only gets WhatsApp when the participant ticked it
 * (whatsapp_reminders_enabled), has a number, and hasn't replied STOP.
 *
 * Idempotent per plan per IST day through claim_whatsapp_reminder
 * (supabase/migrations/084_whatsapp_reminder_claims.sql), independent of the
 * email claim, so one channel failing never blocks or repeats the other.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentISTDate, istToUTCDateTime } from "@/lib/timezone-utils";
import { getWeekdayIST } from "@/lib/personal-action-generation";
import { reminderDaysFor } from "@/lib/reminder-days";
import {
  buildReminderActionContext,
  subscriptionKey,
  type ReminderAction,
  type ReminderSubscription,
} from "@/lib/action-reminders";
import { buildActionReminder } from "@/lib/whatsapp-templates";
import { isWhatsAppSendConfigured, sendWhatsAppTemplate } from "@/lib/whatsapp";

export type WhatsAppReminderRunSummary = {
  configured: boolean;
  sent: number;
  failed: number;
  skippedNotDue: number;
  skippedNoNumber: number;
  skippedOptedOut: number;
  skippedEmpty: number;
  skippedClaimed: number;
};

type WhatsAppReminderSubscription = ReminderSubscription & { whatsapp_reminders_enabled: boolean };

/** Matches the email's fixed reminder time; only used for the shared context lookup. */
const REMINDER_TIME_IST = "11:30";

export async function sendWhatsAppActionReminders(): Promise<WhatsAppReminderRunSummary> {
  const summary: WhatsAppReminderRunSummary = {
    configured: isWhatsAppSendConfigured(),
    sent: 0,
    failed: 0,
    skippedNotDue: 0,
    skippedNoNumber: 0,
    skippedOptedOut: 0,
    skippedEmpty: 0,
    skippedClaimed: 0,
  };
  if (!summary.configured) return summary;

  const admin = createAdminClient();
  const todayIST = getCurrentISTDate();
  const todayWeekday = getWeekdayIST(todayIST);

  const { data: subscriptionRows, error: subscriptionError } = await admin
    .from("personal_action_subscriptions")
    .select("id, user_id, cohort_id, track, day_of_week, days_of_week, email_reminders_enabled, last_reminder_sent_date, whatsapp_reminders_enabled")
    .eq("is_active", true)
    .eq("whatsapp_reminders_enabled", true)
    .is("archived_at", null)
    .not("cohort_id", "is", null);
  if (subscriptionError) {
    console.error("[whatsapp-reminders] failed to load subscriptions", subscriptionError.message);
    return { ...summary, failed: 1 };
  }

  const dueToday = ((subscriptionRows ?? []) as WhatsAppReminderSubscription[]).filter((sub) => {
    const due = reminderDaysFor(sub).includes(todayWeekday);
    if (!due) summary.skippedNotDue += 1;
    return due;
  });
  if (!dueToday.length) return summary;

  const userIds = [...new Set(dueToday.map((sub) => sub.user_id))];
  const [{ data: contacts, error: contactError }, { data: profiles, error: profileError }] = await Promise.all([
    admin.from("whatsapp_contacts").select("user_id, phone, opted_out_at").in("user_id", userIds),
    admin.from("profiles").select("id, full_name, persistent_login_key").in("id", userIds),
  ]);
  if (contactError || profileError) {
    console.error("[whatsapp-reminders] failed to load contacts/profiles", contactError?.message ?? profileError?.message);
    return { ...summary, failed: dueToday.length };
  }
  const contactByUser = new Map((contacts ?? []).map((c) => [c.user_id as string, c]));
  const profileByUser = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  const reachable = dueToday.filter((sub) => {
    const contact = contactByUser.get(sub.user_id);
    if (!contact) {
      summary.skippedNoNumber += 1;
      return false;
    }
    if (contact.opted_out_at) {
      summary.skippedOptedOut += 1;
      return false;
    }
    return true;
  });
  if (!reachable.length) return summary;

  const { actionIdsBySubscription, actionMap, companyByCohortId } = await buildReminderActionContext(
    admin,
    reachable.map((sub) => ({ sub, scheduledFor: istToUTCDateTime(todayIST, REMINDER_TIME_IST) }))
  );

  for (const sub of reachable) {
    const actions = (actionIdsBySubscription.get(subscriptionKey(sub.user_id, sub.cohort_id)) ?? [])
      .map((id) => actionMap.get(id))
      .filter((action): action is ReminderAction => Boolean(action))
      .sort((left, right) => (left.planOrder ?? Number.MAX_SAFE_INTEGER) - (right.planOrder ?? Number.MAX_SAFE_INTEGER));
    const profile = profileByUser.get(sub.user_id);
    // The button is the participant's auto-login link; without a key there's nothing to link to.
    if (!actions.length || !profile?.persistent_login_key) {
      summary.skippedEmpty += 1;
      continue;
    }

    const { data: claimId, error: claimError } = await admin.rpc("claim_whatsapp_reminder", {
      p_subscription_id: sub.id,
      p_user_id: sub.user_id,
      p_cohort_id: sub.cohort_id,
      p_reminder_date: todayIST,
    });
    if (claimError) {
      console.error("[whatsapp-reminders] failed to claim reminder", { subscriptionId: sub.id, error: claimError.message });
      summary.failed += 1;
      continue;
    }
    if (!claimId) {
      summary.skippedClaimed += 1;
      continue;
    }

    const { template, components } = buildActionReminder({
      companyName: companyByCohortId.get(sub.cohort_id)?.name ?? null,
      firstName: (profile.full_name as string | null)?.trim().split(/\s+/)[0] ?? null,
      track: sub.track,
      actionTitles: actions.map((action) => action.title),
      loginKey: profile.persistent_login_key as string,
    });
    const result = await sendWhatsAppTemplate({
      to: contactByUser.get(sub.user_id)!.phone as string,
      template,
      components,
      userId: sub.user_id,
      purpose: "action_reminder",
    });

    const now = new Date().toISOString();
    await admin
      .from("whatsapp_reminder_claims")
      .update({
        status: result.ok ? "sent" : "failed",
        wamid: result.ok ? result.wamid : null,
        template_name: template.name,
        action_count: actions.length,
        last_error: result.ok ? null : result.error,
        sent_at: result.ok ? now : null,
        updated_at: now,
      })
      .eq("id", String(claimId));

    if (result.ok) {
      summary.sent += 1;
    } else {
      summary.failed += 1;
      console.error("[whatsapp-reminders] send failed", { subscriptionId: sub.id, error: result.error });
    }
  }

  return summary;
}
