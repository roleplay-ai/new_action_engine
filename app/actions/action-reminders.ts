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
import { DAILY_DELIVERY_DAYS, getWeekdayIST } from "@/lib/personal-action-generation";
import {
  ACTION_REMINDER_APP_URL,
  FIXED_WEEKLY_RECAP_TIME_IST,
  fetchWalletEmailSummary,
} from "@/lib/action-reminders";

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
  kind: "reminder" | "recap";
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

export type UpcomingWeeklyRecap = {
  subscriptionId: string;
  userId: string;
  email: string;
  fullName: string | null;
  cohortId: string;
  cohortName: string;
  batchName: string | null;
  moduleName: string | null;
  companyName: string | null;
  companyLogo: string | null;
  track: "daily" | "weekly";
  recapDate: string;
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

export type UpcomingActionReminder = {
  subscriptionId: string;
  userId: string;
  email: string;
  fullName: string | null;
  cohortId: string;
  cohortName: string;
  batchName: string | null;
  moduleName: string | null;
  companyName: string | null;
  companyLogo: string | null;
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
  if (subscription.track === "daily") return [...DAILY_DELIVERY_DAYS];
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
  if (subscription.track === "daily") return "Weekdays at 11:30 AM IST";
  const days = getReminderDays(subscription)
    .sort((left, right) => left - right)
    .map((day) => WEEKDAYS[day])
    .join(", ");
  return `${days || "Weekly"} at 11:30 AM IST`;
}

/**
 * Shared lookup for both "upcoming" queues (the per-day reminder and the
 * Friday recap): resolves every subscription's email/login-key, cohort +
 * company context, and currently open ("scheduled") actions.
 */
async function resolveSubscriptionContext(
  admin: ReturnType<typeof createAdminClient>,
  subscriptions: ReminderSubscriptionRow[]
): Promise<
  | {
      authUsers: Map<string, string>;
      profileMap: Map<string, { fullName: string | null; hasLoginKey: boolean }>;
      cohortMap: Map<string, string>;
      cohortBatchModuleMap: Map<string, { batchName: string | null; moduleName: string | null }>;
      companyByCohortId: Map<string, { name: string; logo_url: string | null } | null>;
      actionMap: Map<
        string,
        { id: string; title: string; theme: string; how: string; timeEstimate: string; planOrder: number | null }
      >;
      actionIdsBySubscription: Map<string, string[]>;
    }
  | { error: string }
> {
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
    admin.from("cohorts").select("id, name, batch_name, module_name, company_id").in("id", cohortIds),
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

  const companyIds = [
    ...new Set((cohorts ?? []).map((cohort) => cohort.company_id).filter((id): id is string => !!id)),
  ];
  const { data: companyRows, error: companiesError } = companyIds.length
    ? await admin.from("companies").select("id, name, logo_url").in("id", companyIds)
    : { data: [] as { id: string; name: string; logo_url: string | null }[], error: null };
  if (companiesError) return { error: companiesError.message };
  const companyMap = new Map((companyRows ?? []).map((company) => [company.id, company]));
  const companyByCohortId = new Map(
    (cohorts ?? []).map((cohort) => [cohort.id, cohort.company_id ? companyMap.get(cohort.company_id) ?? null : null])
  );

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
  const cohortBatchModuleMap = new Map(
    (cohorts ?? []).map((cohort) => [
      cohort.id,
      { batchName: cohort.batch_name as string | null, moduleName: cohort.module_name as string | null },
    ])
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

  return { authUsers, profileMap, cohortMap, cohortBatchModuleMap, companyByCohortId, actionMap, actionIdsBySubscription };
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

  const context = await resolveSubscriptionContext(admin, subscriptions);
  if ("error" in context) return { error: context.error };
  const { authUsers, profileMap, cohortMap, cohortBatchModuleMap, companyByCohortId, actionMap, actionIdsBySubscription } = context;

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
        batchName: cohortBatchModuleMap.get(subscription.cohort_id)?.batchName ?? null,
        moduleName: cohortBatchModuleMap.get(subscription.cohort_id)?.moduleName ?? null,
        companyName: companyByCohortId.get(subscription.cohort_id)?.name ?? null,
        companyLogo: companyByCohortId.get(subscription.cohort_id)?.logo_url ?? null,
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

function getNextWeeklyRecapOccurrence() {
  const today = getCurrentISTDate();
  const FRIDAY = 5;
  for (let offset = 0; offset <= 7; offset += 1) {
    const recapDate = addDaysToDate(today, offset);
    if (getWeekdayIST(recapDate) !== FRIDAY) continue;
    return {
      recapDate,
      scheduledFor: istToUTCDateTime(recapDate, FIXED_WEEKLY_RECAP_TIME_IST),
    };
  }
  // Unreachable — a 7-day window always contains a Friday.
  return { recapDate: today, scheduledFor: istToUTCDateTime(today, FIXED_WEEKLY_RECAP_TIME_IST) };
}

/**
 * Every active subscription (daily or weekly track alike) and what the next
 * Friday recap would send them right now. Unlike the per-day reminder, the
 * recap isn't gated by a chosen day — it's the same broadcast to everyone
 * with email reminders enabled.
 */
async function loadUpcomingWeeklyRecap(): Promise<{
  data?: UpcomingWeeklyRecap[];
  error?: string;
}> {
  const admin = createAdminClient();
  const { data: subscriptionRows, error: subscriptionError } = await admin
    .from("personal_action_subscriptions")
    .select("id, user_id, cohort_id, track, day_of_week, days_of_week, last_reminder_sent_date")
    .eq("is_active", true)
    .eq("email_reminders_enabled", true)
    .is("archived_at", null)
    .not("cohort_id", "is", null);

  if (subscriptionError) return { error: subscriptionError.message };
  const subscriptions = (subscriptionRows ?? []) as ReminderSubscriptionRow[];
  if (!subscriptions.length) return { data: [] };

  const context = await resolveSubscriptionContext(admin, subscriptions);
  if ("error" in context) return { error: context.error };
  const { authUsers, profileMap, cohortMap, cohortBatchModuleMap, companyByCohortId, actionMap, actionIdsBySubscription } = context;

  const occurrence = getNextWeeklyRecapOccurrence();

  const upcoming = subscriptions
    .map((subscription): UpcomingWeeklyRecap => {
      const actions = (
        actionIdsBySubscription.get(`${subscription.user_id}:${subscription.cohort_id}`) ?? []
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
            (left.planOrder ?? Number.MAX_SAFE_INTEGER) - (right.planOrder ?? Number.MAX_SAFE_INTEGER)
        )
        .map(({ planOrder: _planOrder, ...action }) => action);
      const email = authUsers.get(subscription.user_id) ?? "";
      const profile = profileMap.get(subscription.user_id);
      const blockedReason = !email
        ? "User email not found."
        : !profile?.hasLoginKey
          ? "No secure login key."
          : actions.length === 0
            ? "Nothing open — the recap would skip this participant."
            : null;

      return {
        subscriptionId: subscription.id,
        userId: subscription.user_id,
        email,
        fullName: profile?.fullName ?? null,
        cohortId: subscription.cohort_id,
        cohortName: cohortMap.get(subscription.cohort_id) ?? "Unknown cohort",
        batchName: cohortBatchModuleMap.get(subscription.cohort_id)?.batchName ?? null,
        moduleName: cohortBatchModuleMap.get(subscription.cohort_id)?.moduleName ?? null,
        companyName: companyByCohortId.get(subscription.cohort_id)?.name ?? null,
        companyLogo: companyByCohortId.get(subscription.cohort_id)?.logo_url ?? null,
        track: subscription.track,
        ...occurrence,
        actions,
        actionCount: actions.length,
        canSend: blockedReason === null,
        blockedReason,
      };
    })
    .sort(
      (left, right) =>
        (left.fullName ?? left.email).localeCompare(right.fullName ?? right.email)
    );

  return { data: upcoming };
}

/** Every participant's upcoming Friday week-recap, ordered by name. */
export async function getUpcomingWeeklyRecap(): Promise<
  { data: UpcomingWeeklyRecap[] } | { error: string }
> {
  try {
    await ensureSuperadmin();
    const result = await loadUpcomingWeeklyRecap();
    return result.error ? { error: result.error } : { data: result.data ?? [] };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to load weekly recap",
    };
  }
}

/**
 * Send selected participants' Friday week-recap as a manual override, e.g.
 * for testing. Logged the same as the automatic cron send, but does not
 * touch the (subscription, recap_date) claim, so the automatic Friday send
 * still fires on schedule regardless.
 */
export async function bulkSendWeeklyRecap(
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
    if (!selectedIds.size) return { error: "Select at least one user recap." };
    if (!isResendConfigured()) {
      return {
        error:
          "Email sending is not configured. Add RESEND_API_KEY and RESEND_FROM_EMAIL.",
      };
    }

    const loaded = await loadUpcomingWeeklyRecap();
    if (loaded.error) return { error: loaded.error };
    const recaps = (loaded.data ?? []).filter((recap) => selectedIds.has(recap.subscriptionId));
    if (!recaps.length) {
      return { error: "The selected participants are no longer upcoming." };
    }

    const admin = createAdminClient();
    const fromEmail = process.env.RESEND_FROM_EMAIL!;
    const results: ManualActionReminderResult[] = [];

    for (const recap of recaps) {
      if (!recap.canSend) {
        results.push({
          subscriptionId: recap.subscriptionId,
          userId: recap.userId,
          email: recap.email,
          fullName: recap.fullName,
          status: "skipped",
          error: recap.blockedReason ?? "Recap cannot be sent.",
        });
        continue;
      }

      let sendResult: Awaited<ReturnType<typeof sendTemplateToUsers>>[number] | undefined;
      try {
        [sendResult] = await sendTemplateToUsers({
          userIds: [recap.userId],
          templateId: "weekly_recap",
          fromEmail,
          baseUrl: ACTION_REMINDER_APP_URL,
          sentBy: null,
          loginPath: "/actions",
          cohortIdForUser: () => recap.cohortId,
          getPerUserTemplateData: async () => {
            const walletSummary = await fetchWalletEmailSummary(admin, recap.userId, recap.cohortId);
            return {
              cohort_name: recap.cohortName,
              batch_name: recap.batchName ?? undefined,
              module_name: recap.moduleName ?? undefined,
              company_name: recap.companyName ?? undefined,
              company_logo: recap.companyLogo ?? undefined,
              actions: recap.actions.map((action) => ({
                id: action.id,
                theme: action.theme,
                title: action.title,
                how: action.how,
                timeEstimate: action.timeEstimate,
              })),
              has_finalised_plan: walletSummary?.hasFinalisedPlan ?? false,
              commitment_score: walletSummary?.currentScore ?? null,
              team_points: walletSummary?.teamPoints ?? 0,
              team_maximum_points: walletSummary?.teamMaximumPoints ?? 0,
              team_rank: walletSummary?.contributionRank ?? null,
              team_size: walletSummary?.teamMemberCount ?? null,
              buddy_name: walletSummary?.buddyName ?? null,
              buddy_score: walletSummary?.buddyScore ?? null,
            };
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Email send failed";
        results.push({
          subscriptionId: recap.subscriptionId,
          userId: recap.userId,
          email: recap.email,
          fullName: recap.fullName,
          status: "failed",
          error: message,
        });
        continue;
      }
      const succeeded = Boolean(sendResult?.success);
      const errorMessage = sendResult?.error ?? (succeeded ? undefined : "Email send failed");

      await admin.from("personal_action_weekly_recap_logs").insert({
        subscription_id: recap.subscriptionId,
        user_id: recap.userId,
        cohort_id: recap.cohortId,
        email: sendResult?.email || recap.email,
        actions: recap.actions.map((action) => ({
          id: action.id,
          title: action.title,
          theme: action.theme,
        })),
        action_count: recap.actionCount,
        recap_date: recap.recapDate,
        scheduled_for: recap.scheduledFor,
        status: succeeded ? "sent" : "failed",
        error_message: errorMessage ?? null,
      });

      results.push({
        subscriptionId: recap.subscriptionId,
        userId: recap.userId,
        email: sendResult?.email || recap.email,
        fullName: recap.fullName,
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
      error: error instanceof Error ? error.message : "Failed to send weekly recaps",
    };
  }
}

/**
 * Send selected participant reminders as an unrestricted manual override.
 * Manual sends are logged but do not claim or consume the automatic occurrence.
 */
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

      let sendResult: Awaited<
        ReturnType<typeof sendTemplateToUsers>
      >[number] | undefined;
      try {
        [sendResult] = await sendTemplateToUsers({
          userIds: [reminder.userId],
          templateId: "daily_reminder",
          fromEmail,
          baseUrl: ACTION_REMINDER_APP_URL,
          sentBy: null,
          loginPath: "/actions",
          cohortIdForUser: () => reminder.cohortId,
          getPerUserTemplateData: async () => {
            const walletSummary = await fetchWalletEmailSummary(admin, reminder.userId, reminder.cohortId);
            return {
              cohort_name: reminder.cohortName,
              batch_name: reminder.batchName ?? undefined,
              module_name: reminder.moduleName ?? undefined,
              company_name: reminder.companyName ?? undefined,
              company_logo: reminder.companyLogo ?? undefined,
              reminder_schedule: reminder.scheduleLabel,
              actions: reminder.actions.map((action) => ({
                id: action.id,
                theme: action.theme,
                title: action.title,
                how: action.how,
                timeEstimate: action.timeEstimate,
              })),
              has_finalised_plan: walletSummary?.hasFinalisedPlan ?? false,
              commitment_score: walletSummary?.currentScore ?? null,
              team_points: walletSummary?.teamPoints ?? 0,
              team_maximum_points: walletSummary?.teamMaximumPoints ?? 0,
              team_rank: walletSummary?.contributionRank ?? null,
              team_size: walletSummary?.teamMemberCount ?? null,
              buddy_name: walletSummary?.buddyName ?? null,
              buddy_score: walletSummary?.buddyScore ?? null,
            };
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Email send failed";
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
// No artificial page size for this admin history view — 5000 is a safety
// ceiling against a runaway query, not a "recent N" cap. Raise it further if
// send volume ever outgrows it.
const REMINDER_LOG_SAFETY_CEILING = 5000;

/**
 * Send history for both the daily/weekly action-reminder emails and the
 * Friday week-recap emails, merged and sorted newest first. Pass `limit` to
 * cap the result; omitted, every row up to the safety ceiling is returned —
 * this view is meant to show the whole history, not just a recent slice.
 */
export async function getActionReminderLogs(
  limit = REMINDER_LOG_SAFETY_CEILING
): Promise<{ data: ActionReminderLog[] } | { error: string }> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const [reminderResult, recapResult] = await Promise.all([
      admin
        .from("personal_action_reminder_logs")
        .select("id, user_id, cohort_id, email, actions, action_count, status, error_message, scheduled_for, reminder_date, created_at")
        .order("created_at", { ascending: false })
        .limit(limit),
      admin
        .from("personal_action_weekly_recap_logs")
        .select("id, user_id, cohort_id, email, actions, action_count, status, error_message, scheduled_for, recap_date, created_at")
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

    if (reminderResult.error) return { error: reminderResult.error.message };
    if (recapResult.error) return { error: recapResult.error.message };

    const reminderLogs = (reminderResult.data ?? []).map((l) => ({ ...l, kind: "reminder" as const, date: l.reminder_date }));
    const recapLogs = (recapResult.data ?? []).map((l) => ({ ...l, kind: "recap" as const, date: l.recap_date }));
    const merged = [...reminderLogs, ...recapLogs]
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
      .slice(0, limit);

    const userIds = [...new Set(merged.map((l) => l.user_id))];
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string | null]));
    const cohortIds = [...new Set(merged.map((log) => log.cohort_id).filter(Boolean))];
    const { data: cohorts } = await admin
      .from("cohorts")
      .select("id, name")
      .in("id", cohortIds.length ? cohortIds : ["00000000-0000-0000-0000-000000000000"]);
    const cohortNameMap = new Map((cohorts ?? []).map((cohort) => [cohort.id, cohort.name as string]));

    return {
      data: merged.map((l) => ({
        id: l.id,
        kind: l.kind,
        userId: l.user_id,
        email: l.email,
        fullName: nameMap.get(l.user_id) ?? null,
        actions: Array.isArray(l.actions) ? l.actions : [],
        actionCount: l.action_count,
        status: l.status,
        errorMessage: l.error_message,
        cohortName: l.cohort_id ? cohortNameMap.get(l.cohort_id) ?? null : null,
        scheduledFor: l.scheduled_for ?? null,
        reminderDate: l.date ?? null,
        createdAt: l.created_at,
      })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}
