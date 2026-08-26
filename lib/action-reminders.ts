/**
 * Participant action-reminder emails.
 *
 * The participant's active cohort plan is the source of truth for:
 * - whether email is enabled;
 * - daily vs weekly delivery;
 * - the selected weekday;
 * - the fixed free-cron reminder time (11:30 AM IST);
 * - which current cohort actions belong in the message.
 *
 * The shared cron can run frequently. Database claims make each scheduled
 * reminder idempotent and allow at most three delayed retries after failures.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateToUsers } from "@/lib/email-send";
import {
  getCurrentISTDate,
  istToUTCDateTime,
} from "@/lib/timezone-utils";
import { DAILY_DELIVERY_DAYS, getWeekdayIST } from "@/lib/personal-action-generation";

export type ActionReminderRunSummary = {
  sent: number;
  failed: number;
  skippedEmpty: number;
  skippedNotDue: number;
  skippedDisabled: number;
  skippedClaimed: number;
};

type ReminderSubscription = {
  id: string;
  user_id: string;
  cohort_id: string;
  track: "daily" | "weekly";
  day_of_week: number | null;
  days_of_week: number[] | null;
  email_reminders_enabled: boolean;
  last_reminder_sent_date: string | null;
};

type ReminderAction = {
  id: string;
  title: string;
  how: string;
  theme: string;
  timeEstimate: string;
  planOrder: number | null;
};

export type WalletEmailSummary = {
  hasFinalisedPlan?: boolean;
  currentScore?: number | null;
  teamPoints?: number;
  teamMaximumPoints?: number;
  contributionRank?: number | null;
  teamMemberCount?: number;
  buddyName?: string | null;
  buddyScore?: number | null;
};

/** Live score/rank/buddy data for the reminder email — see get_commitment_wallet_email_summary. */
export async function fetchWalletEmailSummary(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  cohortId: string
): Promise<WalletEmailSummary | null> {
  const { data, error } = await admin.rpc("get_commitment_wallet_email_summary", {
    p_user_id: userId,
    p_cohort_id: cohortId,
  });
  if (error) {
    console.error("[action-reminders] failed to load wallet summary for email", {
      userId,
      error: error.message,
    });
    return null;
  }
  return data as unknown as WalletEmailSummary;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function subscriptionKey(userId: string, cohortId: string) {
  return `${userId}:${cohortId}`;
}

function formatReminderTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes || 0).padStart(2, "0")} ${suffix}`;
}

const FIXED_REMINDER_TIME_IST = "11:30";
export const ACTION_REMINDER_APP_URL =
  "https://practice.nudgeable.ai";

function reminderScheduleLabel(sub: ReminderSubscription) {
  const time = `${formatReminderTime(FIXED_REMINDER_TIME_IST)} IST`;
  if (sub.track === "daily") return `Weekdays at ${time}`;
  const day = WEEKDAYS[(sub.days_of_week ?? [sub.day_of_week ?? 1])[0] ?? 1];
  return `Every ${day} at ${time}`;
}

/**
 * Shared lookup used by both the per-day reminder and the Friday week recap:
 * for a set of due subscriptions, resolves each subscription's currently
 * "scheduled" (not yet validated) actions plus the cohort/company context
 * needed to render either email.
 */
async function buildReminderActionContext(
  admin: ReturnType<typeof createAdminClient>,
  dueSubscriptions: Array<{ sub: ReminderSubscription; scheduledFor: string }>
) {
  const userIds = [...new Set(dueSubscriptions.map(({ sub }) => sub.user_id))];
  const cohortIds = [...new Set(dueSubscriptions.map(({ sub }) => sub.cohort_id))];

  const [{ data: userActions }, { data: cohorts }] = await Promise.all([
    admin
      .from("user_actions")
      .select("user_id, cohort_id, action_id")
      .in("user_id", userIds)
      .eq("status", "scheduled"),
    admin
      .from("cohorts")
      .select("id, name, batch_name, module_name, company_id")
      .in("id", cohortIds),
  ]);

  const companyIds = [...new Set((cohorts ?? []).map((cohort) => cohort.company_id).filter((id): id is string => !!id))];
  const { data: companies } = companyIds.length
    ? await admin.from("companies").select("id, name, logo_url").in("id", companyIds)
    : { data: [] as { id: string; name: string; logo_url: string | null }[] };
  const companyByCohortId = new Map(
    (cohorts ?? []).map((cohort) => [cohort.id, companies?.find((company) => company.id === cohort.company_id) ?? null])
  );

  const actionIdsBySubscription = new Map<string, string[]>();
  for (const userAction of userActions ?? []) {
    if (!userAction.cohort_id) continue;
    const key = subscriptionKey(userAction.user_id, userAction.cohort_id);
    const ids = actionIdsBySubscription.get(key) ?? [];
    ids.push(userAction.action_id);
    actionIdsBySubscription.set(key, ids);
  }

  const allActionIds = [...new Set([...actionIdsBySubscription.values()].flat())];
  const { data: actionRows } = allActionIds.length
    ? await admin
        .from("actions")
        .select("id, title, how, theme, time_estimate, plan_order")
        .in("id", allActionIds)
    : { data: [] };

  const actionMap = new Map<string, ReminderAction>(
    (actionRows ?? []).map((action) => [
      action.id,
      {
        id: action.id,
        title: action.title,
        how: action.how,
        theme: action.theme,
        timeEstimate: action.time_estimate,
        planOrder: action.plan_order ?? null,
      },
    ])
  );
  const cohortNameMap = new Map((cohorts ?? []).map((cohort) => [cohort.id, cohort.name]));
  const cohortBatchModuleMap = new Map(
    (cohorts ?? []).map((cohort) => [cohort.id, { batchName: cohort.batch_name as string | null, moduleName: cohort.module_name as string | null }])
  );

  return { actionIdsBySubscription, actionMap, cohortNameMap, cohortBatchModuleMap, companyByCohortId };
}

export async function sendDailyActionReminders(
  _baseUrl: string,
  fromEmail: string
): Promise<ActionReminderRunSummary> {
  const admin = createAdminClient();
  const todayIST = getCurrentISTDate();
  const todayWeekday = getWeekdayIST(todayIST);

  const summary: ActionReminderRunSummary = {
    sent: 0,
    failed: 0,
    skippedEmpty: 0,
    skippedNotDue: 0,
    skippedDisabled: 0,
    skippedClaimed: 0,
  };

  const { data: subscriptionRows, error: subscriptionError } = await admin
    .from("personal_action_subscriptions")
    .select("id, user_id, cohort_id, track, day_of_week, days_of_week, email_reminders_enabled, last_reminder_sent_date")
    .eq("is_active", true)
    .is("archived_at", null)
    .not("cohort_id", "is", null);

  if (subscriptionError) {
    console.error("[action-reminders] failed to load subscriptions", subscriptionError.message);
    return { ...summary, failed: 1 };
  }

  const dueSubscriptions: Array<{
    sub: ReminderSubscription;
    scheduledFor: string;
  }> = [];

  for (const row of subscriptionRows ?? []) {
    const sub = row as ReminderSubscription;
    if (!sub.email_reminders_enabled) {
      summary.skippedDisabled += 1;
      continue;
    }
    if (sub.last_reminder_sent_date === todayIST) {
      summary.skippedClaimed += 1;
      continue;
    }

    const days = sub.track === "daily"
      ? [...DAILY_DELIVERY_DAYS]
      : sub.days_of_week ?? (sub.day_of_week != null ? [sub.day_of_week] : null);
    if (!days?.includes(todayWeekday)) {
      summary.skippedNotDue += 1;
      continue;
    }

    dueSubscriptions.push({
      sub,
      scheduledFor: istToUTCDateTime(todayIST, FIXED_REMINDER_TIME_IST),
    });
  }

  if (!dueSubscriptions.length) return summary;

  const {
    actionIdsBySubscription,
    actionMap,
    cohortNameMap,
    cohortBatchModuleMap,
    companyByCohortId,
  } = await buildReminderActionContext(admin, dueSubscriptions);

  const claimed: Array<{
    claimId: string;
    sub: ReminderSubscription;
    actions: ReminderAction[];
    scheduledFor: string;
    cohortName: string;
    batchName?: string;
    moduleName?: string;
    companyName?: string;
    companyLogo?: string;
  }> = [];

  for (const due of dueSubscriptions) {
    const ids = actionIdsBySubscription.get(subscriptionKey(due.sub.user_id, due.sub.cohort_id)) ?? [];
    const actions = ids
      .map((id) => actionMap.get(id))
      .filter((action): action is ReminderAction => Boolean(action))
      .sort((left, right) => (left.planOrder ?? Number.MAX_SAFE_INTEGER) - (right.planOrder ?? Number.MAX_SAFE_INTEGER));

    if (!actions.length) {
      summary.skippedEmpty += 1;
      continue;
    }

    const { data: claimId, error: claimError } = await admin.rpc(
      "claim_personal_action_reminder",
      {
        p_subscription_id: due.sub.id,
        p_user_id: due.sub.user_id,
        p_cohort_id: due.sub.cohort_id,
        p_reminder_date: todayIST,
        p_scheduled_for: due.scheduledFor,
      }
    );

    if (claimError) {
      console.error("[action-reminders] failed to claim reminder", {
        subscriptionId: due.sub.id,
        error: claimError.message,
      });
      summary.failed += 1;
      continue;
    }
    if (!claimId) {
      summary.skippedClaimed += 1;
      continue;
    }

    const company = companyByCohortId.get(due.sub.cohort_id);
    const batchModule = cohortBatchModuleMap.get(due.sub.cohort_id);
    claimed.push({
      claimId: String(claimId),
      ...due,
      actions,
      cohortName: cohortNameMap.get(due.sub.cohort_id) ?? "Your batch",
      batchName: batchModule?.batchName ?? undefined,
      moduleName: batchModule?.moduleName ?? undefined,
      companyName: company?.name ?? undefined,
      companyLogo: company?.logo_url ?? undefined,
    });
  }

  if (!claimed.length) return summary;

  const claimedByUser = new Map(claimed.map((item) => [item.sub.user_id, item]));
  const results = await sendTemplateToUsers({
    userIds: [...claimedByUser.keys()],
    templateId: "daily_reminder",
    fromEmail,
    baseUrl: ACTION_REMINDER_APP_URL,
    sentBy: null,
    loginPath: "/actions",
    cohortIdForUser: (userId) => claimedByUser.get(userId)?.sub.cohort_id ?? null,
    getPerUserTemplateData: async (userId) => {
      const item = claimedByUser.get(userId);
      const walletSummary: WalletEmailSummary | null = item
        ? await fetchWalletEmailSummary(admin, userId, item.sub.cohort_id)
        : null;

      return {
        cohort_name: item?.cohortName,
        batch_name: item?.batchName,
        module_name: item?.moduleName,
        company_name: item?.companyName,
        company_logo: item?.companyLogo,
        reminder_schedule: item
          ? reminderScheduleLabel(item.sub)
          : undefined,
        actions: (item?.actions ?? []).map((action) => ({
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

  for (const result of results) {
    const item = claimedByUser.get(result.userId);
    if (!item) continue;

    await admin.from("personal_action_reminder_logs").insert({
      subscription_id: item.sub.id,
      user_id: result.userId,
      cohort_id: item.sub.cohort_id,
      email: result.email,
      actions: item.actions.map((action) => ({
        id: action.id,
        title: action.title,
        theme: action.theme,
      })),
      action_count: item.actions.length,
      reminder_date: todayIST,
      scheduled_for: item.scheduledFor,
      status: result.success ? "sent" : "failed",
      error_message: result.error ?? null,
    });

    await admin
      .from("personal_action_reminder_claims")
      .update({
        status: result.success ? "sent" : "failed",
        last_error: result.error ?? null,
        sent_at: result.success ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.claimId);

    if (result.success) {
      summary.sent += 1;
      await admin
        .from("personal_action_subscriptions")
        .update({ last_reminder_sent_date: todayIST })
        .eq("id", item.sub.id)
        .eq("cohort_id", item.sub.cohort_id);
    } else {
      summary.failed += 1;
    }
  }

  return summary;
}

// ─── Friday week recap (all unvalidated actions, one bulk-complete link) ───

export type WeeklyRecapRunSummary = {
  sent: number;
  failed: number;
  skippedEmpty: number;
  skippedDisabled: number;
  skippedClaimed: number;
};

export const FIXED_WEEKLY_RECAP_TIME_IST = "16:00";

/**
 * Sends every active participant (daily or weekly track) a Friday recap of
 * whatever is still "scheduled" — i.e. not yet validated — for the week,
 * with a single "I completed all" link that bulk-completes the whole list
 * instead of per-action links. Meant to be triggered once a week (Fridays,
 * 4:00 PM IST / 10:30 UTC — see vercel.json) by its own cron path; the
 * (subscription, recap_date) claim below keeps repeated or overlapping
 * invocations on the same day idempotent regardless of how often it's hit.
 */
export async function sendWeeklyUnvalidatedRecap(fromEmail: string): Promise<WeeklyRecapRunSummary> {
  const admin = createAdminClient();
  const todayIST = getCurrentISTDate();

  const summary: WeeklyRecapRunSummary = {
    sent: 0,
    failed: 0,
    skippedEmpty: 0,
    skippedDisabled: 0,
    skippedClaimed: 0,
  };

  const { data: subscriptionRows, error: subscriptionError } = await admin
    .from("personal_action_subscriptions")
    .select("id, user_id, cohort_id, track, day_of_week, days_of_week, email_reminders_enabled, last_reminder_sent_date")
    .eq("is_active", true)
    .is("archived_at", null)
    .not("cohort_id", "is", null);

  if (subscriptionError) {
    console.error("[action-reminders] failed to load subscriptions for weekly recap", subscriptionError.message);
    return { ...summary, failed: 1 };
  }

  // Unlike the daily/weekly reminder, the recap isn't gated by the
  // subscription's chosen day — it's a once-a-week broadcast to everyone
  // still enrolled, regardless of their daily/weekly cadence.
  const dueSubscriptions: Array<{ sub: ReminderSubscription; scheduledFor: string }> = [];
  for (const row of subscriptionRows ?? []) {
    const sub = row as ReminderSubscription;
    if (!sub.email_reminders_enabled) {
      summary.skippedDisabled += 1;
      continue;
    }
    dueSubscriptions.push({ sub, scheduledFor: istToUTCDateTime(todayIST, FIXED_WEEKLY_RECAP_TIME_IST) });
  }

  if (!dueSubscriptions.length) return summary;

  const {
    actionIdsBySubscription,
    actionMap,
    cohortNameMap,
    cohortBatchModuleMap,
    companyByCohortId,
  } = await buildReminderActionContext(admin, dueSubscriptions);

  const claimed: Array<{
    claimId: string;
    sub: ReminderSubscription;
    actions: ReminderAction[];
    scheduledFor: string;
    cohortName: string;
    batchName?: string;
    moduleName?: string;
    companyName?: string;
    companyLogo?: string;
  }> = [];

  for (const due of dueSubscriptions) {
    const ids = actionIdsBySubscription.get(subscriptionKey(due.sub.user_id, due.sub.cohort_id)) ?? [];
    const actions = ids
      .map((id) => actionMap.get(id))
      .filter((action): action is ReminderAction => Boolean(action))
      .sort((left, right) => (left.planOrder ?? Number.MAX_SAFE_INTEGER) - (right.planOrder ?? Number.MAX_SAFE_INTEGER));

    if (!actions.length) {
      summary.skippedEmpty += 1;
      continue;
    }

    const { data: claimId, error: claimError } = await admin.rpc(
      "claim_personal_action_weekly_recap",
      {
        p_subscription_id: due.sub.id,
        p_user_id: due.sub.user_id,
        p_cohort_id: due.sub.cohort_id,
        p_recap_date: todayIST,
        p_scheduled_for: due.scheduledFor,
      }
    );

    if (claimError) {
      console.error("[action-reminders] failed to claim weekly recap", {
        subscriptionId: due.sub.id,
        error: claimError.message,
      });
      summary.failed += 1;
      continue;
    }
    if (!claimId) {
      summary.skippedClaimed += 1;
      continue;
    }

    const company = companyByCohortId.get(due.sub.cohort_id);
    const batchModule = cohortBatchModuleMap.get(due.sub.cohort_id);
    claimed.push({
      claimId: String(claimId),
      ...due,
      actions,
      cohortName: cohortNameMap.get(due.sub.cohort_id) ?? "Your batch",
      batchName: batchModule?.batchName ?? undefined,
      moduleName: batchModule?.moduleName ?? undefined,
      companyName: company?.name ?? undefined,
      companyLogo: company?.logo_url ?? undefined,
    });
  }

  if (!claimed.length) return summary;

  const claimedByUser = new Map(claimed.map((item) => [item.sub.user_id, item]));
  const results = await sendTemplateToUsers({
    userIds: [...claimedByUser.keys()],
    templateId: "weekly_recap",
    fromEmail,
    baseUrl: ACTION_REMINDER_APP_URL,
    sentBy: null,
    loginPath: "/actions",
    cohortIdForUser: (userId) => claimedByUser.get(userId)?.sub.cohort_id ?? null,
    getPerUserTemplateData: async (userId) => {
      const item = claimedByUser.get(userId);
      const walletSummary: WalletEmailSummary | null = item
        ? await fetchWalletEmailSummary(admin, userId, item.sub.cohort_id)
        : null;

      return {
        cohort_name: item?.cohortName,
        batch_name: item?.batchName,
        module_name: item?.moduleName,
        company_name: item?.companyName,
        company_logo: item?.companyLogo,
        actions: (item?.actions ?? []).map((action) => ({
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

  for (const result of results) {
    const item = claimedByUser.get(result.userId);
    if (!item) continue;

    await admin.from("personal_action_weekly_recap_logs").insert({
      subscription_id: item.sub.id,
      user_id: result.userId,
      cohort_id: item.sub.cohort_id,
      email: result.email,
      actions: item.actions.map((action) => ({
        id: action.id,
        title: action.title,
        theme: action.theme,
      })),
      action_count: item.actions.length,
      recap_date: todayIST,
      scheduled_for: item.scheduledFor,
      status: result.success ? "sent" : "failed",
      error_message: result.error ?? null,
    });

    await admin
      .from("personal_action_weekly_recap_claims")
      .update({
        status: result.success ? "sent" : "failed",
        last_error: result.error ?? null,
        sent_at: result.success ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.claimId);

    if (result.success) {
      summary.sent += 1;
    } else {
      summary.failed += 1;
    }
  }

  return summary;
}
