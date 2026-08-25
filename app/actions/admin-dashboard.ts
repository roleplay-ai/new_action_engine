"use server";

/**
 * Server actions for the admin Dashboard's batch/module drill-down section:
 * a weekly due-vs-completed action trend, commitment-score buckets, a
 * commitment-score leaderboard, a batch's weekly commitment-score trend
 * (+ week-over-week delta), and email open rates (welcome vs. reminder,
 * category-wise).
 *
 * Reuses getAdminContext/loadCommitmentWalletByCohort from admin-analytics.ts
 * rather than duplicating the company/role resolution or the Commitment
 * Wallet rollup math.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext, loadCommitmentWalletByCohort } from "./admin-analytics";

type Admin = ReturnType<typeof createAdminClient>;

/** The real Commitment Score, matching get_my_commitment_wallet()'s formula (see
 * supabase/migrations/046_commitment_wallet_plan_bonus.sql) and what participants see on
 * /wallet: starts at 100% when a plan is finalised and drops as actions are missed —
 * NOT the points-banked/maximum-points ratio (which only climbs and never reflects misses). */
function walletScorePct(plannedActions: number, missedActions: number) {
  return plannedActions > 0 ? Math.round((Math.max(0, plannedActions - missedActions) * 100) / plannedActions) : 0;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;

/** Batch-relative week number (1-indexed) for a date given the batch's start anchor. */
function weekNumberFor(date: Date, anchor: Date): number {
  const diffDays = Math.floor((date.getTime() - anchor.getTime()) / DAY_MS);
  return Math.max(1, Math.floor(diffDays / WEEK_DAYS) + 1);
}

/** All (non-archived) cohort ids for a company, or just [cohortId] when one is selected —
 * the "consolidated / one batch" switch every action below shares. */
async function resolveCohortIds(admin: Admin, companyId: string, cohortId: string | null): Promise<string[]> {
  if (cohortId) return [cohortId];
  const { data } = await admin
    .from("cohorts")
    .select("id")
    .eq("company_id", companyId)
    .is("archived_at", null);
  return (data ?? []).map((c: { id: string }) => c.id);
}

/** End-user (role='user') ids in scope: one cohort's members, or every end-user in the company. */
async function resolveScopedUserIds(admin: Admin, companyId: string, cohortId: string | null): Promise<string[]> {
  if (cohortId) {
    const { data: memberRows } = await admin.from("cohort_members").select("user_id").eq("cohort_id", cohortId);
    const ids = [...new Set((memberRows ?? []).map((m: { user_id: string }) => m.user_id))];
    if (!ids.length) return [];
    const { data: profiles } = await admin.from("profiles").select("id, role").in("id", ids);
    return (profiles ?? [])
      .filter((p: { role: string }) => p.role === "user")
      .map((p: { id: string }) => p.id);
  }
  const { data: profiles } = await admin.from("profiles").select("id, role").eq("company_id", companyId);
  return (profiles ?? [])
    .filter((p: { role: string }) => p.role === "user")
    .map((p: { id: string }) => p.id);
}

/** Each cohort's start anchor for week-relative bucketing: earliest cohort_dates.event_date,
 * falling back to the cohort's created_at when it has no dates recorded yet. */
async function resolveCohortStartAnchors(admin: Admin, cohortIds: string[]): Promise<Map<string, Date>> {
  const anchors = new Map<string, Date>();
  if (!cohortIds.length) return anchors;

  const { data: cohortRows } = await admin.from("cohorts").select("id, created_at").in("id", cohortIds);
  for (const c of (cohortRows ?? []) as { id: string; created_at: string }[]) {
    anchors.set(c.id, new Date(c.created_at));
  }

  const { data: dateRows } = await admin
    .from("cohort_dates")
    .select("cohort_id, event_date")
    .in("cohort_id", cohortIds)
    .order("event_date", { ascending: true });
  const seen = new Set<string>();
  for (const d of (dateRows ?? []) as { cohort_id: string; event_date: string }[]) {
    if (seen.has(d.cohort_id)) continue;
    seen.add(d.cohort_id);
    anchors.set(d.cohort_id, new Date(d.event_date)); // first row per cohort = earliest, since ordered ascending
  }

  return anchors;
}

export interface BatchOption {
  cohortId: string;
  label: string;
}

/** Feeds the Dashboard's batch/module selector — one option per batch (labeled with its
 * module, since module_name is an attribute of the batch, not an independent filter). */
export async function getBatchOptions(companyId?: string): Promise<{ options: BatchOption[]; error?: string }> {
  try {
    const { companyId: myCompanyId, role } = await getAdminContext();
    const resolvedCompanyId = role === "admin" ? myCompanyId : companyId;
    if (!resolvedCompanyId) return { options: [], error: "Company required" };

    const admin = createAdminClient();
    const { data: cohorts } = await admin
      .from("cohorts")
      .select("id, batch_name, module_name")
      .eq("company_id", resolvedCompanyId)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    const options: BatchOption[] = (cohorts ?? []).map((c: { id: string; batch_name: string; module_name: string | null }) => ({
      cohortId: c.id,
      label: c.module_name ? `${c.batch_name} — ${c.module_name}` : c.batch_name,
    }));

    return { options };
  } catch (e) {
    return { options: [], error: e instanceof Error ? e.message : "Failed" };
  }
}

export interface ActionWeeklyTrendEntry {
  weekNumber: number;
  /** Actions scheduled/due for delivery in this batch-relative week (user_actions.scheduled_at). */
  due: number;
  /** Of those, how many have since been validated (status = 'success'), regardless of when. */
  completed: number;
}

/** Weekly "due vs. completed" action counts for the batch/module drill-down: for each
 * batch-relative week, how many actions were scheduled to go out that week
 * (user_actions.scheduled_at), and how many of those have since been completed —
 * whenever the completion actually happened, not just if it landed in the same week. */
export async function getActionCompletionWeeklyTrend(
  companyId?: string,
  cohortId?: string | null
): Promise<{ entries: ActionWeeklyTrendEntry[]; error?: string }> {
  try {
    const { companyId: myCompanyId, role } = await getAdminContext();
    const resolvedCompanyId = role === "admin" ? myCompanyId : companyId;
    if (!resolvedCompanyId) return { entries: [], error: "Company required" };

    const admin = createAdminClient();
    const userIds = await resolveScopedUserIds(admin, resolvedCompanyId, cohortId ?? null);
    if (!userIds.length) return { entries: [] };

    const cohortIds = await resolveCohortIds(admin, resolvedCompanyId, cohortId ?? null);
    if (!cohortIds.length) return { entries: [] };
    const anchors = await resolveCohortStartAnchors(admin, cohortIds);

    const { data: uaRows } = await admin
      .from("user_actions")
      .select("cohort_id, status, scheduled_at")
      .in("cohort_id", cohortIds)
      .in("user_id", userIds)
      .not("scheduled_at", "is", null);

    const now = new Date();
    let maxWeek = 1;
    for (const id of cohortIds) {
      const anchor = anchors.get(id);
      if (anchor) maxWeek = Math.max(maxWeek, weekNumberFor(now, anchor));
    }

    const weeklyMap = new Map<number, { due: number; completed: number }>();
    for (const row of (uaRows ?? []) as { cohort_id: string | null; status: string; scheduled_at: string }[]) {
      const anchor = row.cohort_id ? anchors.get(row.cohort_id) : undefined;
      if (!anchor) continue;
      const week = weekNumberFor(new Date(row.scheduled_at), anchor);
      const bucket = weeklyMap.get(week) ?? { due: 0, completed: 0 };
      bucket.due += 1;
      if (row.status === "success") bucket.completed += 1;
      weeklyMap.set(week, bucket);
    }

    const entries: ActionWeeklyTrendEntry[] = [];
    for (let week = 1; week <= maxWeek; week++) {
      const b = weeklyMap.get(week) ?? { due: 0, completed: 0 };
      entries.push({ weekNumber: week, due: b.due, completed: b.completed });
    }

    return { entries };
  } catch (e) {
    return { entries: [], error: e instanceof Error ? e.message : "Failed" };
  }
}

export interface CommitmentScoreBuckets {
  band90to100: number;
  band75to89: number;
  band50to74: number;
  belowBand50: number;
  /** Users with no finalised plan yet — kept separate so they don't skew "below 50" downward. */
  notStarted: number;
  totalUsers: number;
}

const EMPTY_SCORE_BUCKETS: CommitmentScoreBuckets = {
  band90to100: 0,
  band75to89: 0,
  band50to74: 0,
  belowBand50: 0,
  notStarted: 0,
  totalUsers: 0,
};

/** Buckets end-users by Commitment Score (same 100%-minus-missed-actions formula as /wallet):
 * 90-100, 75-89, 50-74, below 50 — plus a "not started" count for anyone without a finalised plan. */
export async function getCommitmentScoreBuckets(
  companyId?: string,
  cohortId?: string | null
): Promise<{ buckets?: CommitmentScoreBuckets; error?: string }> {
  try {
    const { companyId: myCompanyId, role } = await getAdminContext();
    const resolvedCompanyId = role === "admin" ? myCompanyId : companyId;
    if (!resolvedCompanyId) return { error: "Company required" };

    const admin = createAdminClient();
    const userIds = await resolveScopedUserIds(admin, resolvedCompanyId, cohortId ?? null);
    if (!userIds.length) return { buckets: EMPTY_SCORE_BUCKETS };
    const userIdSet = new Set(userIds);

    const cohortIds = await resolveCohortIds(admin, resolvedCompanyId, cohortId ?? null);
    const commitmentByCohort = await loadCommitmentWalletByCohort(admin, cohortIds);

    const commitmentByUser = new Map<string, { maximum: number; plannedActions: number; missedActions: number }>();
    for (const { perUser } of commitmentByCohort.values()) {
      for (const [userId, uc] of perUser) {
        if (!userIdSet.has(userId)) continue;
        const existing = commitmentByUser.get(userId);
        if (existing) {
          existing.maximum += uc.maximum;
          existing.plannedActions += uc.plannedActions;
          existing.missedActions += uc.missedActions;
        } else {
          commitmentByUser.set(userId, { maximum: uc.maximum, plannedActions: uc.plannedActions, missedActions: uc.missedActions });
        }
      }
    }

    const buckets: CommitmentScoreBuckets = { ...EMPTY_SCORE_BUCKETS, totalUsers: userIds.length };
    for (const userId of userIds) {
      const c = commitmentByUser.get(userId);
      if (!c || c.maximum === 0) {
        buckets.notStarted += 1;
        continue;
      }
      const pct = walletScorePct(c.plannedActions, c.missedActions);
      if (pct >= 90) buckets.band90to100 += 1;
      else if (pct >= 75) buckets.band75to89 += 1;
      else if (pct >= 50) buckets.band50to74 += 1;
      else buckets.belowBand50 += 1;
    }

    return { buckets };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export interface DashboardLeaderboardEntry {
  id: string;
  name: string;
  commitmentPoints: number;
  commitmentMaximum: number;
  commitmentPct: number;
  /** True when the member has ≥1 user_action in scope (same as batch "Action readers"). */
  isActionReader: boolean;
  /** Auto-expired failures still awaiting confirm — matches Actions "Pending validation". */
  pendingValidationCount: number;
  /** Confirmed fails/skips — matches Actions "Didn't complete". */
  notCompletedCount: number;
}

/** Leaderboard ranked by commitment score % (not raw points, unlike getEngagementLeaderboard,
 * which the Engagement page keeps as-is) — scoped to one batch, or company-wide when none given. */
export async function getDashboardLeaderboard(
  companyId?: string,
  cohortId?: string | null
): Promise<{ entries: DashboardLeaderboardEntry[]; error?: string }> {
  try {
    const { companyId: myCompanyId, role } = await getAdminContext();
    const resolvedCompanyId = role === "admin" ? myCompanyId : companyId;
    if (!resolvedCompanyId) return { entries: [], error: "Company required" };

    const admin = createAdminClient();
    const userIds = await resolveScopedUserIds(admin, resolvedCompanyId, cohortId ?? null);
    if (!userIds.length) return { entries: [] };
    const userIdSet = new Set(userIds);

    const { data: profiles } = await admin.from("profiles").select("id, full_name").in("id", userIds);
    const nameById = new Map(
      (profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name?.trim() || "User"])
    );

    const cohortIds = await resolveCohortIds(admin, resolvedCompanyId, cohortId ?? null);
    const commitmentByCohort = await loadCommitmentWalletByCohort(admin, cohortIds);

    const commitmentByUser = new Map<string, { points: number; maximum: number; plannedActions: number; missedActions: number }>();
    for (const { perUser } of commitmentByCohort.values()) {
      for (const [userId, uc] of perUser) {
        if (!userIdSet.has(userId)) continue;
        const existing = commitmentByUser.get(userId);
        if (existing) {
          existing.points += uc.points;
          existing.maximum += uc.maximum;
          existing.plannedActions += uc.plannedActions;
          existing.missedActions += uc.missedActions;
        } else {
          commitmentByUser.set(userId, { points: uc.points, maximum: uc.maximum, plannedActions: uc.plannedActions, missedActions: uc.missedActions });
        }
      }
    }

    // Same Action reader / Pending validation / Didn't complete split as cohort analytics members.
    let uaQuery = admin
      .from("user_actions")
      .select("user_id, status, auto_expired")
      .in("user_id", userIds);
    if (cohortId) uaQuery = uaQuery.eq("cohort_id", cohortId);
    else if (cohortIds.length) uaQuery = uaQuery.in("cohort_id", cohortIds);
    const { data: uaRows } = await uaQuery;

    const readers = new Set<string>();
    const pendingByUser = new Map<string, number>();
    const notCompletedByUser = new Map<string, number>();
    for (const row of (uaRows ?? []) as {
      user_id: string;
      status: string;
      auto_expired: boolean | null;
    }[]) {
      readers.add(row.user_id);
      if (row.status === "failed" && row.auto_expired) {
        pendingByUser.set(row.user_id, (pendingByUser.get(row.user_id) ?? 0) + 1);
      } else if ((row.status === "failed" || row.status === "skipped") && !row.auto_expired) {
        notCompletedByUser.set(row.user_id, (notCompletedByUser.get(row.user_id) ?? 0) + 1);
      }
    }

    const entries: DashboardLeaderboardEntry[] = userIds.map((id) => {
      const c = commitmentByUser.get(id);
      return {
        id,
        name: nameById.get(id) ?? "User",
        commitmentPoints: c?.points ?? 0,
        commitmentMaximum: c?.maximum ?? 0,
        commitmentPct: walletScorePct(c?.plannedActions ?? 0, c?.missedActions ?? 0),
        isActionReader: readers.has(id),
        pendingValidationCount: pendingByUser.get(id) ?? 0,
        notCompletedCount: notCompletedByUser.get(id) ?? 0,
      };
    });
    entries.sort((a, b) => b.commitmentPct - a.commitmentPct || b.commitmentPoints - a.commitmentPoints);

    return { entries };
  } catch (e) {
    return { entries: [], error: e instanceof Error ? e.message : "Failed" };
  }
}

export interface CommitmentWeeklyTrendEntry {
  weekNumber: number;
  avgCommitmentPct: number;
}

/** Average commitment score per batch-relative week (cumulative, as of the end of each week),
 * plus a ready-made week-over-week delta for the last two elapsed weeks. */
export async function getBatchCommitmentWeeklyTrend(
  companyId?: string,
  cohortId?: string | null
): Promise<{
  entries: CommitmentWeeklyTrendEntry[];
  currentWeekAvg: number | null;
  previousWeekAvg: number | null;
  deltaPct: number | null;
  error?: string;
}> {
  const empty = { entries: [], currentWeekAvg: null, previousWeekAvg: null, deltaPct: null };
  try {
    const { companyId: myCompanyId, role } = await getAdminContext();
    const resolvedCompanyId = role === "admin" ? myCompanyId : companyId;
    if (!resolvedCompanyId) return { ...empty, error: "Company required" };

    const admin = createAdminClient();
    const cohortIds = await resolveCohortIds(admin, resolvedCompanyId, cohortId ?? null);
    if (!cohortIds.length) return empty;

    const anchors = await resolveCohortStartAnchors(admin, cohortIds);

    const { data: plans } = await admin
      .from("commitment_wallet_plans")
      .select("id, cohort_id, planned_actions, finalised_at")
      .in("cohort_id", cohortIds);
    const planRows = (plans ?? []) as {
      id: string;
      cohort_id: string;
      planned_actions: number;
      finalised_at: string;
    }[];
    if (!planRows.length) return empty;
    const planIds = planRows.map((p) => p.id);

    const { data: events } = await admin
      .from("commitment_wallet_events")
      .select("plan_id, event_type, settled_at")
      .in("plan_id", planIds)
      .order("settled_at", { ascending: true });
    const eventsByPlan = new Map<string, { missed: boolean; settledAt: string }[]>();
    for (const e of (events ?? []) as { plan_id: string; event_type: string; settled_at: string }[]) {
      const list = eventsByPlan.get(e.plan_id) ?? [];
      list.push({ missed: e.event_type === "missed" || e.event_type === "completed_late", settledAt: e.settled_at });
      eventsByPlan.set(e.plan_id, list);
    }

    const now = new Date();
    let maxWeek = 1;
    for (const id of cohortIds) {
      const anchor = anchors.get(id);
      if (anchor) maxWeek = Math.max(maxWeek, weekNumberFor(now, anchor));
    }

    // Same 100%-minus-missed-actions formula as get_my_commitment_wallet() / the /wallet page
    // (see walletScorePct) — tracked cumulatively per week instead of the points-banked ratio,
    // which only climbs and never reflects a miss.
    const weeklySums = new Map<number, { sum: number; count: number }>();
    for (const plan of planRows) {
      const anchor = anchors.get(plan.cohort_id);
      if (!anchor) continue;
      const plannedActions = plan.planned_actions;
      if (plannedActions <= 0) continue;

      const finalisedWeek = weekNumberFor(new Date(plan.finalised_at), anchor);
      const events = (eventsByPlan.get(plan.id) ?? []).map((e) => ({
        missed: e.missed,
        week: weekNumberFor(new Date(e.settledAt), anchor),
      }));

      let cumMissed = 0;
      let eventIdx = 0;
      for (let week = 1; week <= maxWeek; week++) {
        while (eventIdx < events.length && events[eventIdx].week <= week) {
          if (events[eventIdx].missed) cumMissed += 1;
          eventIdx += 1;
        }
        if (week < finalisedWeek) continue; // plan didn't exist yet at this point in the batch

        const pct = walletScorePct(plannedActions, cumMissed);
        const entry = weeklySums.get(week) ?? { sum: 0, count: 0 };
        entry.sum += pct;
        entry.count += 1;
        weeklySums.set(week, entry);
      }
    }

    const entries: CommitmentWeeklyTrendEntry[] = [];
    for (let week = 1; week <= maxWeek; week++) {
      const s = weeklySums.get(week);
      entries.push({ weekNumber: week, avgCommitmentPct: s && s.count > 0 ? Math.round(s.sum / s.count) : 0 });
    }

    const currentWeekAvg = entries.length ? entries[entries.length - 1].avgCommitmentPct : null;
    const previousWeekAvg = entries.length > 1 ? entries[entries.length - 2].avgCommitmentPct : null;
    const deltaPct = currentWeekAvg !== null && previousWeekAvg !== null ? currentWeekAvg - previousWeekAvg : null;

    return { entries, currentWeekAvg, previousWeekAvg, deltaPct };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "Failed" };
  }
}

export interface EmailOpenWeeklyEntry {
  weekNumber: number;
  welcomeSent: number;
  welcomeOpened: number;
  welcomeOpenRate: number;
  welcomeClicked: number;
  welcomeClickRate: number;
  reminderSent: number;
  reminderOpened: number;
  reminderOpenRate: number;
  reminderClicked: number;
  reminderClickRate: number;
}

export interface EmailEngagementTotals {
  sent: number;
  opened: number;
  openRate: number;
  clicked: number;
  clickRate: number;
}

const ZERO_TOTALS: EmailEngagementTotals = { sent: 0, opened: 0, openRate: 0, clicked: 0, clickRate: 0 };

/** Weekly + total-current open AND click rates for welcome ("credentials" template) and
 * reminder ("daily_reminder" template) emails, category-wise, from Resend via the webhook at
 * app/api/webhooks/resend/route.ts. `webhookConfigured` tells the UI whether to show a
 * "tracking not enabled yet" banner instead of trusting a flat 0% as real data. */
export async function getEmailOpenRates(
  companyId?: string,
  cohortId?: string | null
): Promise<{
  weekly: EmailOpenWeeklyEntry[];
  welcomeTotals: EmailEngagementTotals;
  reminderTotals: EmailEngagementTotals;
  webhookConfigured: boolean;
  error?: string;
}> {
  const empty = {
    weekly: [],
    welcomeTotals: ZERO_TOTALS,
    reminderTotals: ZERO_TOTALS,
    webhookConfigured: !!process.env.RESEND_WEBHOOK_SECRET,
  };
  try {
    const { companyId: myCompanyId, role } = await getAdminContext();
    const resolvedCompanyId = role === "admin" ? myCompanyId : companyId;
    if (!resolvedCompanyId) return { ...empty, error: "Company required" };

    const admin = createAdminClient();
    const cohortIds = await resolveCohortIds(admin, resolvedCompanyId, cohortId ?? null);
    if (!cohortIds.length) return empty;

    const anchors = await resolveCohortStartAnchors(admin, cohortIds);
    const scopedUserIds = await resolveScopedUserIds(admin, resolvedCompanyId, cohortId ?? null);
    const cohortIdSet = new Set(cohortIds);
    const scopedUserSet = new Set(scopedUserIds);

    const { data: attributedRows } = await admin
      .from("email_campaign_logs")
      .select("user_id, template_id, cohort_id, created_at, opened_at, clicked_at")
      .in("cohort_id", cohortIds)
      .in("template_id", ["credentials", "daily_reminder"])
      .eq("status", "sent");

    // Older sends logged cohort_id as null, so also pull those rows by recipient
    // membership in the selected batch(es).
    const { data: unattributedRows } = scopedUserIds.length
      ? await admin
          .from("email_campaign_logs")
          .select("user_id, template_id, cohort_id, created_at, opened_at, clicked_at")
          .is("cohort_id", null)
          .in("user_id", scopedUserIds)
          .in("template_id", ["credentials", "daily_reminder"])
          .eq("status", "sent")
      : { data: [] };

    const seen = new Set<string>();
    const emailRows: {
      user_id: string | null;
      template_id: string;
      cohort_id: string | null;
      created_at: string;
      opened_at: string | null;
      clicked_at: string | null;
    }[] = [];
    for (const row of [...(attributedRows ?? []), ...(unattributedRows ?? [])] as typeof emailRows) {
      const key = `${row.user_id ?? ""}|${row.template_id}|${row.created_at}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (row.cohort_id) {
        if (!cohortIdSet.has(row.cohort_id)) continue;
      } else if (!row.user_id || !scopedUserSet.has(row.user_id)) {
        continue;
      }
      emailRows.push(row);
    }

    const profileCohortByUser = new Map<string, string>();
    if (scopedUserIds.length) {
      const { data: profileRows } = await admin
        .from("profiles")
        .select("id, selected_cohort_id, current_cohort_id")
        .in("id", scopedUserIds);
      for (const p of (profileRows ?? []) as {
        id: string;
        selected_cohort_id: string | null;
        current_cohort_id: string | null;
      }[]) {
        const inferred = p.selected_cohort_id ?? p.current_cohort_id;
        if (inferred && cohortIdSet.has(inferred)) profileCohortByUser.set(p.id, inferred);
      }
    }

    let welcomeSentTotal = 0;
    let welcomeOpenedTotal = 0;
    let welcomeClickedTotal = 0;
    let reminderSentTotal = 0;
    let reminderOpenedTotal = 0;
    let reminderClickedTotal = 0;
    const weeklyMap = new Map<
      number,
      {
        welcomeSent: number;
        welcomeOpened: number;
        welcomeClicked: number;
        reminderSent: number;
        reminderOpened: number;
        reminderClicked: number;
      }
    >();

    for (const row of emailRows) {
      // Click implies open (clients that block pixels often only fire click events).
      const clicked = !!row.clicked_at;
      const opened = !!row.opened_at || clicked;
      if (row.template_id === "credentials") {
        welcomeSentTotal += 1;
        if (opened) welcomeOpenedTotal += 1;
        if (clicked) welcomeClickedTotal += 1;
      } else if (row.template_id === "daily_reminder") {
        reminderSentTotal += 1;
        if (opened) reminderOpenedTotal += 1;
        if (clicked) reminderClickedTotal += 1;
      }

      const attributedCohortId =
        row.cohort_id
        ?? (cohortId && cohortIdSet.has(cohortId) ? cohortId : null)
        ?? (row.user_id ? profileCohortByUser.get(row.user_id) ?? null : null);
      const anchor = attributedCohortId ? anchors.get(attributedCohortId) : undefined;
      if (!anchor) continue; // no batch attribution (e.g. pre-migration send) — still in totals above

      const week = weekNumberFor(new Date(row.created_at), anchor);
      const bucket = weeklyMap.get(week) ?? {
        welcomeSent: 0,
        welcomeOpened: 0,
        welcomeClicked: 0,
        reminderSent: 0,
        reminderOpened: 0,
        reminderClicked: 0,
      };
      if (row.template_id === "credentials") {
        bucket.welcomeSent += 1;
        if (opened) bucket.welcomeOpened += 1;
        if (clicked) bucket.welcomeClicked += 1;
      } else {
        bucket.reminderSent += 1;
        if (opened) bucket.reminderOpened += 1;
        if (clicked) bucket.reminderClicked += 1;
      }
      weeklyMap.set(week, bucket);
    }

    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

    const weekly: EmailOpenWeeklyEntry[] = [...weeklyMap.keys()]
      .sort((a, b) => a - b)
      .map((week) => {
        const b = weeklyMap.get(week)!;
        return {
          weekNumber: week,
          welcomeSent: b.welcomeSent,
          welcomeOpened: b.welcomeOpened,
          welcomeOpenRate: pct(b.welcomeOpened, b.welcomeSent),
          welcomeClicked: b.welcomeClicked,
          welcomeClickRate: pct(b.welcomeClicked, b.welcomeSent),
          reminderSent: b.reminderSent,
          reminderOpened: b.reminderOpened,
          reminderOpenRate: pct(b.reminderOpened, b.reminderSent),
          reminderClicked: b.reminderClicked,
          reminderClickRate: pct(b.reminderClicked, b.reminderSent),
        };
      });

    return {
      weekly,
      welcomeTotals: {
        sent: welcomeSentTotal,
        opened: welcomeOpenedTotal,
        openRate: pct(welcomeOpenedTotal, welcomeSentTotal),
        clicked: welcomeClickedTotal,
        clickRate: pct(welcomeClickedTotal, welcomeSentTotal),
      },
      reminderTotals: {
        sent: reminderSentTotal,
        opened: reminderOpenedTotal,
        openRate: pct(reminderOpenedTotal, reminderSentTotal),
        clicked: reminderClickedTotal,
        clickRate: pct(reminderClickedTotal, reminderSentTotal),
      },
      webhookConfigured: !!process.env.RESEND_WEBHOOK_SECRET,
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "Failed" };
  }
}
