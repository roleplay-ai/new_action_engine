"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResendConfigured } from "@/lib/resend";
import { sendTemplateToUsers } from "@/lib/email-send";
import {
  getCurrentISTDate,
  istToUTCDateTime,
} from "@/lib/timezone-utils";
import { getWeekdayIST } from "@/lib/personal-action-generation";

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
}

export type ActionReminderLog = {
  id: string;
  userId: string;
  email: string;
  fullName: string | null;
  actions: { id: string; title: string; theme: string }[];
  actionCount: number;
  status: "sent" | "failed";
  errorMessage: string | null;
  cohortName: string | null;
  scheduledFor: string | null;
  reminderDate: string | null;
  createdAt: string;
};

export type UpcomingActionReminder = {
  subscriptionId: string;
  userId: string;
  email: string;
  fullName: string | null;
  cohortId: string;
  cohortName: string;
  track: "daily" | "weekly";
  scheduleLabel: string;
  reminderDate: string;
  scheduledFor: string;
  actions: {
    id: string;
    title: string;
    theme: string;
    how: string;
    timeEstimate: string;
  }[];
  actionCount: number;
  canSend: boolean;
  blockedReason: string | null;
};

export type ManualActionReminderResult = {
  subscriptionId: string;
  userId: string;
  email: string;
  fullName: string | null;
  status: "sent" | "failed" | "skipped";
  error?: string;
};

type ReminderSubscriptionRow = {
  id: string;
  user_id: string;
  cohort_id: string;
  track: "daily" | "weekly";
  day_of_week: number | null;
  days_of_week: number[] | null;
  last_reminder_sent_date: string | null;
};

const FIXED_REMINDER_TIME_IST = "11:30";
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function addDaysToDate(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getReminderDays(subscription: ReminderSubscriptionRow) {
  if (subscription.track === "daily") return [0, 1, 2, 3, 4, 5, 6];
  return subscription.days_of_week?.length
    ? subscription.days_of_week
    : subscription.day_of_week != null
      ? [subscription.day_of_week]
      : [];
}

function getNextReminderOccurrence(subscription: ReminderSubscriptionRow) {
  const today = getCurrentISTDate();
  const reminderDays = getReminderDays(subscription);

  for (let offset = 0; offset <= 7; offset += 1) {
    const reminderDate = addDaysToDate(today, offset);
    if (!reminderDays.includes(getWeekdayIST(reminderDate))) continue;
    if (subscription.last_reminder_sent_date === reminderDate) continue;

    return {
      reminderDate,
      scheduledFor: istToUTCDateTime(
        reminderDate,
        FIXED_REMINDER_TIME_IST
      ),
    };
  }

  return null;
}

function getScheduleLabel(subscription: ReminderSubscriptionRow) {
  if (subscription.track === "daily") return "Daily at 11:30 AM IST";
  const days = getReminderDays(subscription)
    .sort((left, right) => left - right)
    .map((day) => WEEKDAYS[day])
    .join(", ");
  return `${days || "Weekly"} at 11:30 AM IST`;
}

async function loadUpcomingActionReminders(): Promise<{
  data?: UpcomingActionReminder[];
  error?: string;
}> {
  const admin = createAdminClient();
  const { data: subscriptionRows, error: subscriptionError } = await admin
    .from("personal_action_subscriptions")
    .select(
      "id, user_id, cohort_id, track, day_of_week, days_of_week, last_reminder_sent_date"
    )
    .eq("is_active", true)
    .eq("email_reminders_enabled", true)
    .is("archived_at", null)
    .not("cohort_id", "is", null);

  if (subscriptionError) return { error: subscriptionError.message };
  const subscriptions = (subscriptionRows ?? []) as ReminderSubscriptionRow[];
  if (!subscriptions.length) return { data: [] };

  const userIds = [...new Set(subscriptions.map((row) => row.user_id))];
  const cohortIds = [...new Set(subscriptions.map((row) => row.cohort_id))];

  const [
    { data: profiles, error: profilesError },
    { data: cohorts, error: cohortsError },
    { data: userActions, error: userActionsError },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, persistent_login_key")
      .in("id", userIds),
    admin.from("cohorts").select("id, name").in("id", cohortIds),
    admin
      .from("user_actions")
      .select("user_id, cohort_id, action_id")
      .in("user_id", userIds)
      .in("cohort_id", cohortIds)
      .eq("status", "scheduled"),
  ]);

  const relatedError = profilesError ?? cohortsError ?? userActionsError;
  if (relatedError) return { error: relatedError.message };

  const actionIds = [
    ...new Set((userActions ?? []).map((row) => row.action_id)),
  ];
  const { data: actionRows, error: actionsError } = actionIds.length
    ? await admin
        .from("actions")
        .select("id, title, how, theme, time_estimate, plan_order")
        .in("id", actionIds)
    : { data: [], error: null };
  if (actionsError) return { error: actionsError.message };

  const authUsers = new Map<string, string>();
  let page = 1;
  const perPage = 1000;
  while (authUsers.size < userIds.length) {
    const { data: usersPage, error: usersError } =
      await admin.auth.admin.listUsers({ page, perPage });
    if (usersError) return { error: usersError.message };
    for (const user of usersPage.users) {
      if (userIds.includes(user.id)) authUsers.set(user.id, user.email ?? "");
    }
    if (usersPage.users.length < perPage) break;
    page += 1;
  }

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      {
        fullName: profile.full_name as string | null,
        hasLoginKey: Boolean(profile.persistent_login_key),
      },
    ])
  );
  const cohortMap = new Map(
    (cohorts ?? []).map((cohort) => [cohort.id, cohort.name as string])
  );
  const actionMap = new Map(
    (actionRows ?? []).map((action) => [
      action.id,
      {
        id: action.id,
        title: action.title,
        theme: action.theme,
        how: action.how,
        timeEstimate: action.time_estimate,
        planOrder: action.plan_order ?? null,
      },
    ])
  );
  const actionIdsBySubscription = new Map<string, string[]>();
  for (const userAction of userActions ?? []) {
    if (!userAction.cohort_id) continue;
    const key = `${userAction.user_id}:${userAction.cohort_id}`;
    const ids = actionIdsBySubscription.get(key) ?? [];
    ids.push(userAction.action_id);
    actionIdsBySubscription.set(key, ids);
  }

  const upcoming = subscriptions
    .map((subscription): UpcomingActionReminder | null => {
      const occurrence = getNextReminderOccurrence(subscription);
      if (!occurrence) return null;
      const actions = (
        actionIdsBySubscription.get(
          `${subscription.user_id}:${subscription.cohort_id}`
        ) ?? []
      )
        .map((id) => actionMap.get(id))
        .filter(
          (
            action
          ): action is {
            id: string;
            title: string;
            theme: string;
            how: string;
            timeEstimate: string;
            planOrder: number | null;
          } => Boolean(action)
        )
        .sort(
          (left, right) =>
            (left.planOrder ?? Number.MAX_SAFE_INTEGER) -
            (right.planOrder ?? Number.MAX_SAFE_INTEGER)
        )
        .map(({ planOrder: _planOrder, ...action }) => action);
      const email = authUsers.get(subscription.user_id) ?? "";
      const profile = profileMap.get(subscription.user_id);
      const blockedReason = !email
        ? "User email not found."
        : !profile?.hasLoginKey
          ? "No secure login key."
          : actions.length === 0
            ? "No scheduled actions to include."
            : null;

      return {
        subscriptionId: subscription.id,
        userId: subscription.user_id,
        email,
        fullName: profile?.fullName ?? null,
        cohortId: subscription.cohort_id,
        cohortName:
          cohortMap.get(subscription.cohort_id) ?? "Unknown cohort",
        track: subscription.track,
        scheduleLabel: getScheduleLabel(subscription),
        ...occurrence,
        actions,
        actionCount: actions.length,
        canSend: blockedReason === null,
        blockedReason,
      };
    })
    .filter(
      (reminder): reminder is UpcomingActionReminder => Boolean(reminder)
    )
    .sort(
      (left, right) =>
        new Date(left.scheduledFor).getTime() -
          new Date(right.scheduledFor).getTime() ||
        (left.fullName ?? left.email).localeCompare(
          right.fullName ?? right.email
        )
    );

  return { data: upcoming };
}

/** Upcoming participant action-reminder emails, ordered by their next IST send. */
export async function getUpcomingActionReminders(): Promise<
  { data: UpcomingActionReminder[] } | { error: string }
> {
  try {
    await ensureSuperadmin();
    const result = await loadUpcomingActionReminders();
    return result.error
      ? { error: result.error }
      : { data: result.data ?? [] };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to load reminders",
    };
  }
}

/** Send selected participants' next reminder occurrence immediately. */
export async function bulkSendUpcomingActionReminders(
  subscriptionIds: string[]
): Promise<
  | { data: ManualActionReminderResult[]; sent: number; failed: number; skipped: number }
  | { error: string }
> {
  try {
    await ensureSuperadmin();
    const selectedIds = new Set(
      subscriptionIds.filter((id) => typeof id === "string" && id.trim())
    );
    if (!selectedIds.size) return { error: "Select at least one user reminder." };
    if (!isResendConfigured()) {
      return {
        error:
          "Email sending is not configured. Add RESEND_API_KEY and RESEND_FROM_EMAIL.",
      };
    }

    const loaded = await loadUpcomingActionReminders();
    if (loaded.error) return { error: loaded.error };
    const reminders = (loaded.data ?? []).filter((reminder) =>
      selectedIds.has(reminder.subscriptionId)
    );
    if (!reminders.length) {
      return { error: "The selected user reminders are no longer upcoming." };
    }

    const admin = createAdminClient();
    const fromEmail = process.env.RESEND_FROM_EMAIL!;
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");
    const results: ManualActionReminderResult[] = [];

    for (const reminder of reminders) {
      if (!reminder.canSend) {
        results.push({
          subscriptionId: reminder.subscriptionId,
          userId: reminder.userId,
          email: reminder.email,
          fullName: reminder.fullName,
          status: "skipped",
          error: reminder.blockedReason ?? "Reminder cannot be sent.",
        });
        continue;
      }

      const { data: claimId, error: claimError } = await admin.rpc(
        "claim_personal_action_reminder",
        {
          p_subscription_id: reminder.subscriptionId,
          p_user_id: reminder.userId,
          p_cohort_id: reminder.cohortId,
          p_reminder_date: reminder.reminderDate,
          p_scheduled_for: reminder.scheduledFor,
        }
      );

      if (claimError || !claimId) {
        results.push({
          subscriptionId: reminder.subscriptionId,
          userId: reminder.userId,
          email: reminder.email,
          fullName: reminder.fullName,
          status: "skipped",
          error:
            claimError?.message ??
            "This reminder is already sent, running, or awaiting retry.",
        });
        continue;
      }

      let sendResult: Awaited<
        ReturnType<typeof sendTemplateToUsers>
      >[number] | undefined;
      try {
        [sendResult] = await sendTemplateToUsers({
          userIds: [reminder.userId],
          templateId: "daily_reminder",
          fromEmail,
          baseUrl,
          sentBy: null,
          loginPath: "/actions",
          getPerUserTemplateData: async () => ({
            cohort_name: reminder.cohortName,
            reminder_schedule: reminder.scheduleLabel,
            actions: reminder.actions.map((action) => ({
              theme: action.theme,
              title: action.title,
              how: action.how,
              timeEstimate: action.timeEstimate,
            })),
          }),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Email send failed";
        await admin
          .from("personal_action_reminder_claims")
          .update({
            status: "failed",
            last_error: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", String(claimId));
        results.push({
          subscriptionId: reminder.subscriptionId,
          userId: reminder.userId,
          email: reminder.email,
          fullName: reminder.fullName,
          status: "failed",
          error: message,
        });
        continue;
      }
      const succeeded = Boolean(sendResult?.success);
      const errorMessage =
        sendResult?.error ?? (succeeded ? undefined : "Email send failed");
      const completedAt = new Date().toISOString();

      await admin.from("personal_action_reminder_logs").insert({
        subscription_id: reminder.subscriptionId,
        user_id: reminder.userId,
        cohort_id: reminder.cohortId,
        email: sendResult?.email || reminder.email,
        actions: reminder.actions.map((action) => ({
          id: action.id,
          title: action.title,
          theme: action.theme,
        })),
        action_count: reminder.actionCount,
        reminder_date: reminder.reminderDate,
        scheduled_for: reminder.scheduledFor,
        status: succeeded ? "sent" : "failed",
        error_message: errorMessage ?? null,
      });

      await admin
        .from("personal_action_reminder_claims")
        .update({
          status: succeeded ? "sent" : "failed",
          last_error: errorMessage ?? null,
          sent_at: succeeded ? completedAt : null,
          updated_at: completedAt,
        })
        .eq("id", String(claimId));

      if (succeeded) {
        await admin
          .from("personal_action_subscriptions")
          .update({ last_reminder_sent_date: reminder.reminderDate })
          .eq("id", reminder.subscriptionId)
          .eq("cohort_id", reminder.cohortId);
      }

      results.push({
        subscriptionId: reminder.subscriptionId,
        userId: reminder.userId,
        email: sendResult?.email || reminder.email,
        fullName: reminder.fullName,
        status: succeeded ? "sent" : "failed",
        error: errorMessage,
      });
    }

    revalidatePath("/superadmin/emails");
    return {
      data: results,
      sent: results.filter((result) => result.status === "sent").length,
      failed: results.filter((result) => result.status === "failed").length,
      skipped: results.filter((result) => result.status === "skipped").length,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to send reminders",
    };
  }
}

/** Send history for the per-user daily/weekly action-reminder emails, newest first. */
export async function getActionReminderLogs(
  limit = 100
): Promise<{ data: ActionReminderLog[] } | { error: string }> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const { data: logs, error } = await admin
      .from("personal_action_reminder_logs")
      .select("id, user_id, cohort_id, email, actions, action_count, status, error_message, scheduled_for, reminder_date, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return { error: error.message };

    const userIds = [...new Set((logs ?? []).map((l) => l.user_id))];
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string | null]));
    const cohortIds = [...new Set((logs ?? []).map((log) => log.cohort_id).filter(Boolean))];
    const { data: cohorts } = await admin
      .from("cohorts")
      .select("id, name")
      .in("id", cohortIds.length ? cohortIds : ["00000000-0000-0000-0000-000000000000"]);
    const cohortNameMap = new Map((cohorts ?? []).map((cohort) => [cohort.id, cohort.name as string]));

    return {
      data: (logs ?? []).map((l) => ({
        id: l.id,
        userId: l.user_id,
        email: l.email,
        fullName: nameMap.get(l.user_id) ?? null,
        actions: Array.isArray(l.actions) ? l.actions : [],
        actionCount: l.action_count,
        status: l.status,
        errorMessage: l.error_message,
        cohortName: l.cohort_id ? cohortNameMap.get(l.cohort_id) ?? null : null,
        scheduledFor: l.scheduled_for ?? null,
        reminderDate: l.reminder_date ?? null,
        createdAt: l.created_at,
      })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}
