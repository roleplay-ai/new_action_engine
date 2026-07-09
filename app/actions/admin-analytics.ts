"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { League } from "@/lib/types";
import { getPointsForEvent } from "@/lib/points";

async function getAdminContext(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  companyId: string | null;
  role: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "user";
  if (role !== "admin" && role !== "superadmin") {
    throw new Error("Forbidden: admin or superadmin only");
  }

  return {
    supabase,
    companyId: profile?.company_id ?? null,
    role,
  };
}

/** Get company-scoped analytics. Superadmin must pass companyId. */
export async function getCompanyAnalytics(companyId?: string): Promise<{
  error?: string;
  usersCount?: number;
  actionsCount?: number;
  userActionsByStatus?: Record<string, number>;
  adoptionRate?: number;
}> {
  try {
    const { supabase, companyId: myCompanyId, role } = await getAdminContext();

    const resolvedCompanyId = role === "admin" ? myCompanyId : companyId;
    if (!resolvedCompanyId) {
      return { error: "Company required" };
    }

    const { count: usersCount } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("company_id", resolvedCompanyId);

    const { count: actionsCount } = await supabase
      .from("actions")
      .select("id", { count: "exact", head: true })
      .eq("company_id", resolvedCompanyId);

    const { data: companyUsers } = await supabase
      .from("profiles")
      .select("id")
      .eq("company_id", resolvedCompanyId);
    const userIds = (companyUsers ?? []).map((u) => u.id);

    let userActionRows: { status: string }[] = [];
    if (userIds.length > 0) {
      const { data } = await supabase
        .from("user_actions")
        .select("status")
        .in("user_id", userIds);
      userActionRows = data ?? [];
    }

    const statusCounts: Record<string, number> = {};
    for (const row of userActionRows ?? []) {
      statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    }

    const total = (userActionRows ?? []).length;
    const successful = statusCounts["success"] ?? 0;
    const adoptionRate = total > 0 ? Math.round((successful / total) * 100) : 0;

    return {
      usersCount: usersCount ?? 0,
      actionsCount: actionsCount ?? 0,
      userActionsByStatus: statusCounts,
      adoptionRate,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Behavioural journey funnel for Analytics tab. Uses admin client to read company users' user_actions. */
export async function getBehaviouralJourneyFunnel(companyId?: string): Promise<{
  error?: string;
  usersCount?: number;
  /** Total actions delivered = sum over packages of (package_actions count × assigned users count). */
  totalActionsDelivered?: number;
  /** Average actions per user (total delivered / users). */
  averageActionsPerUser?: number;
  /** Actions accepted by users (user_actions count). */
  intentionTotal?: number;
  /** Actions validated (user_actions with status success). */
  actionsValidated?: number;
  /** Average percentage of deliveries per user that have at least one user_action row. */
  consistentlyActivePct?: number;
  /** Users whose deliveries are all active (at least one user_action for every delivered action). */
  consistentlyActiveUsersCount?: number;
  /** Users with at least one user_action row. */
  actionReadersCount?: number;
  /** Percentage of users with at least one user_action row. */
  actionReadersPct?: number;
  /** Users who have validated an action (success). */
  actionTakersCount?: number;
  /** Percentage of users who have validated an action. */
  actionTakersPct?: number;
  /** Users with no user_action rows. */
  inactiveUsersCount?: number;
  /** Percentage of users with no user_action rows. */
  inactiveUsersPct?: number;
}> {
  try {
    const { companyId: myCompanyId, role } = await getAdminContext();
    const resolvedCompanyId = role === "admin" ? myCompanyId : companyId;
    if (!resolvedCompanyId) {
      return { error: "Company required" };
    }

    const admin = createAdminClient();

    const { data: companyProfiles } = await admin
      .from("profiles")
      .select("id, role")
      .eq("company_id", resolvedCompanyId);
    // Only include end-users in analytics; exclude company admins/superadmins.
    const userIds = (companyProfiles ?? [])
      .filter((p) => p.role === "user")
      .map((p) => p.id);
    const usersCount = userIds.length;

    // Company-wide engagement metrics initialised to 0; will be populated if we have data.
    let consistentlyActivePct = 0;
    let consistentlyActiveUsersCount = 0;
    let actionReadersCount = 0;
    let actionReadersPct = 0;
    let actionTakersCount = 0;
    let actionTakersPct = 0;
    let inactiveUsersCount = 0;
    let inactiveUsersPct = 0;

    let totalActionsDelivered = 0;
    const { data: packages } = await admin
      .from("packages")
      .select("id")
      .eq("company_id", resolvedCompanyId);
    const packageIds = (packages ?? []).map((p) => p.id);

    // Preload package_actions and package_assignments for all packages to compute per-user deliveries.
    let packageActions:
      | { package_id: string; action_id: string }[]
      | null = null;
    let packageAssignments:
      | { package_id: string; user_id: string }[]
      | null = null;
    if (packageIds.length > 0) {
      const { data: paRows } = await admin
        .from("package_actions")
        .select("package_id, action_id")
        .in("package_id", packageIds);
      const { data: assignRows } = await admin
        .from("package_assignments")
        .select("package_id, user_id")
        .in("package_id", packageIds);
      packageActions = paRows ?? [];
      packageAssignments = assignRows ?? [];
    }

    for (const pkg of packages ?? []) {
      const { count: paCount } = await admin
        .from("package_actions")
        .select("id", { count: "exact", head: true })
        .eq("package_id", pkg.id);
      const { count: assignCount } = await admin
        .from("package_assignments")
        .select("id", { count: "exact", head: true })
        .eq("package_id", pkg.id);
      totalActionsDelivered += (paCount ?? 0) * (assignCount ?? 0);
    }

    const averageActionsPerUser = usersCount > 0 ? Math.round((totalActionsDelivered / usersCount) * 10) / 10 : 0;

    let intentionTotal = 0;
    let actionsValidated = 0;
    if (userIds.length > 0) {
      const { data: uaRows } = await admin
        .from("user_actions")
        .select("user_id, action_id, status")
        .in("user_id", userIds);
      intentionTotal = (uaRows ?? []).length;

      // Build per-user user_action aggregates for engagement analytics.
      const userActionIdsByUser = new Map<string, Set<string>>();
      const usersWithAnyAction = new Set<string>();
      const actionTakersUsers = new Set<string>();

      for (const row of uaRows ?? []) {
        usersWithAnyAction.add(row.user_id);
        const existing = userActionIdsByUser.get(row.user_id) ?? new Set<string>();
        existing.add(row.action_id);
        userActionIdsByUser.set(row.user_id, existing);

        if (row.status === "success") {
          actionsValidated += 1;
          actionTakersUsers.add(row.user_id);
        }
      }

      // Derive per-user delivery coverage (consistency) using package assignments & actions.
      if (packageActions && packageAssignments && userIds.length > 0) {
        const actionsByPackage = new Map<string, string[]>();
        for (const pa of packageActions) {
          const list = actionsByPackage.get(pa.package_id) ?? [];
          list.push(pa.action_id);
          actionsByPackage.set(pa.package_id, list);
        }

        const deliveriesByUser = new Map<string, Set<string>>();
        for (const assign of packageAssignments) {
          const userId = assign.user_id;
          const actionIdsForPackage =
            actionsByPackage.get(assign.package_id) ?? [];
          if (actionIdsForPackage.length === 0) continue;

          const deliveredSet =
            deliveriesByUser.get(userId) ?? new Set<string>();
          for (const actionId of actionIdsForPackage) {
            deliveredSet.add(actionId);
          }
          deliveriesByUser.set(userId, deliveredSet);
        }

        let consistencySum = 0;
        let consistencyUsers = 0;

        for (const userId of userIds) {
          const deliveredSet = deliveriesByUser.get(userId);
          if (!deliveredSet || deliveredSet.size === 0) continue;

          const totalDelivered = deliveredSet.size;
          const userActionIds = userActionIdsByUser.get(userId);

          let activeDeliveries = 0;
          if (userActionIds) {
            for (const actionId of deliveredSet) {
              if (userActionIds.has(actionId)) {
                activeDeliveries += 1;
              }
            }
          }

          const ratio =
            totalDelivered > 0 ? activeDeliveries / totalDelivered : 0;
          consistencySum += ratio;
          consistencyUsers += 1;

          // User is "consistently active" if they have an action row for every delivered action.
          if (ratio === 1) {
            consistentlyActiveUsersCount += 1;
          }
        }

        if (consistencyUsers > 0) {
          consistentlyActivePct = Math.round(
            (consistencySum / consistencyUsers) * 100
          );
        }
      }

      actionReadersCount = usersWithAnyAction.size;
      inactiveUsersCount = Math.max(0, usersCount - actionReadersCount);
      actionTakersCount = actionTakersUsers.size;

      actionReadersPct =
        usersCount > 0
          ? Math.round((actionReadersCount / usersCount) * 100)
          : 0;
      inactiveUsersPct =
        usersCount > 0
          ? Math.round((inactiveUsersCount / usersCount) * 100)
          : 0;
      actionTakersPct =
        usersCount > 0
          ? Math.round((actionTakersCount / usersCount) * 100)
          : 0;
    }

    return {
      usersCount,
      totalActionsDelivered,
      averageActionsPerUser,
      intentionTotal,
      actionsValidated,
      consistentlyActivePct,
      consistentlyActiveUsersCount,
      actionReadersCount,
      actionReadersPct,
      actionTakersCount,
      actionTakersPct,
      inactiveUsersCount,
      inactiveUsersPct,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export interface EngagementLeaderboardEntry {
  id: string;
  name: string;
  totalPoints: number;
  streak: number;
  acceptedCount: number;
  validatedCount: number;
  league: League;
}

function leagueFromIndex(index: number | null | undefined): League {
  switch (index) {
    case 1:
      return League.Bronze;
    case 2:
      return League.Silver;
    case 3:
      return League.Gold;
    case 4:
      return League.Diamond;
    case 0:
    default:
      return League.Starter;
  }
}

/** Per-user engagement leaderboard for admin User Engagement tab (company-scoped, end-users only). */
export async function getEngagementLeaderboard(companyId?: string): Promise<{
  entries: EngagementLeaderboardEntry[];
  error?: string;
}> {
  try {
    const { companyId: myCompanyId, role } = await getAdminContext();
    const resolvedCompanyId = role === "admin" ? myCompanyId : companyId;
    if (!resolvedCompanyId) {
      return { entries: [], error: "Company required" };
    }

    const admin = createAdminClient();

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, total_points, streak, league_index, role")
      .eq("company_id", resolvedCompanyId);

    const userProfiles =
      (profiles ?? []).filter(
        (p: { role: string }) => p.role === "user"
      ) ?? [];

    const userIds = userProfiles.map((p: { id: string }) => p.id);

    type Counters = {
      acceptedCount: number;
      validatedCount: number;
    };

    const countersByUser = new Map<string, Counters>();
    for (const p of userProfiles as {
      id: string;
    }[]) {
      countersByUser.set(p.id, {
        acceptedCount: 0,
        validatedCount: 0,
      });
    }

    if (userIds.length > 0) {
      const { data: uaRows } = await admin
        .from("user_actions")
        .select("user_id, status")
        .in("user_id", userIds);

      for (const row of (uaRows ??
        []) as { user_id: string; status: string }[]) {
        const counters =
          countersByUser.get(row.user_id) ??
          {
            acceptedCount: 0,
            validatedCount: 0,
          };

        const status = row.status;
        const wasAccepted =
          status === "scheduled" || status === "success" || status === "failed";

        if (wasAccepted) {
          counters.acceptedCount += 1;
        }

        if (status === "success") {
          counters.validatedCount += 1;
        }

        countersByUser.set(row.user_id, counters);
      }
    }

    const entries: EngagementLeaderboardEntry[] = (userProfiles as {
      id: string;
      full_name: string | null;
      total_points: number | null;
      streak: number | null;
      league_index: number | null;
    }[]).map((p) => {
      const counters =
        countersByUser.get(p.id) ??
        ({
          acceptedCount: 0,
          validatedCount: 0,
        } as Counters);

      return {
        id: p.id,
        name: (p.full_name?.trim() || "User") as string,
        totalPoints: p.total_points ?? 0,
        streak: p.streak ?? 0,
        acceptedCount: counters.acceptedCount,
        validatedCount: counters.validatedCount,
        league: leagueFromIndex(p.league_index ?? 0),
      };
    });

    // Sort by total points descending for leaderboard rank.
    entries.sort((a, b) => b.totalPoints - a.totalPoints);

    return { entries };
  } catch (e) {
    return {
      entries: [],
      error: e instanceof Error ? e.message : "Failed",
    };
  }
}

const VALIDATED_STATUSES = ["success"];
const ACTION_ACCEPTED_STATUSES = ["scheduled", "success", "failed"];
const DRIVER_ACCEPTED_STATUSES = ["scheduled", "success"];

/** Per-action metrics for Action Performance table: accepted count, validated count, conversion %. */
export interface ActionMetricEntry {
  actionId: string;
  title: string;
  theme: string;
  acceptedCount: number;
  validatedCount: number;
  conversionPct: number;
}

/** Per-action acceptance, validation %, and conversion (validated/accepted*100), sorted by conversion descending. */
export async function getActionMetrics(companyId?: string): Promise<{
  entries: ActionMetricEntry[];
  error?: string;
}> {
  try {
    const { companyId: myCompanyId, role } = await getAdminContext();
    const resolvedCompanyId = role === "admin" ? myCompanyId : companyId;
    if (!resolvedCompanyId) {
      return { entries: [], error: "Company required" };
    }

    const admin = createAdminClient();

    const { data: companyProfiles } = await admin
      .from("profiles")
      .select("id, role")
      .eq("company_id", resolvedCompanyId);
    const userIds = (companyProfiles ?? [])
      .filter((p: { role: string }) => p.role === "user")
      .map((p: { id: string }) => p.id);

    const { data: actions } = await admin
      .from("actions")
      .select("id, title, theme")
      .eq("company_id", resolvedCompanyId);
    if (!actions?.length) {
      return { entries: [] };
    }

    const actionMap = new Map(
      (actions as { id: string; title: string; theme: string }[]).map((a) => [a.id, a])
    );

    const acceptedByAction = new Map<string, number>();
    const validatedByAction = new Map<string, number>();
    for (const a of actions as { id: string }[]) {
      acceptedByAction.set(a.id, 0);
      validatedByAction.set(a.id, 0);
    }

    if (userIds.length > 0) {
      const { data: uaRows } = await admin
        .from("user_actions")
        .select("action_id, status")
        .in("user_id", userIds);

      for (const row of (uaRows ?? []) as { action_id: string; status: string }[]) {
        const actionId = row.action_id;
        if (!actionMap.has(actionId)) continue;
        if (ACTION_ACCEPTED_STATUSES.includes(row.status)) {
          acceptedByAction.set(actionId, (acceptedByAction.get(actionId) ?? 0) + 1);
        }
        if (VALIDATED_STATUSES.includes(row.status)) {
          validatedByAction.set(actionId, (validatedByAction.get(actionId) ?? 0) + 1);
        }
      }
    }

    const entries: ActionMetricEntry[] = (actions as { id: string; title: string; theme: string }[])
      .map((a) => {
        const accepted = acceptedByAction.get(a.id) ?? 0;
        const validated = validatedByAction.get(a.id) ?? 0;
        const conversionPct = accepted > 0 ? Math.round((validated / accepted) * 100) : 0;
        return {
          actionId: a.id,
          title: a.title,
          theme: a.theme as string,
          acceptedCount: accepted,
          validatedCount: validated,
          conversionPct,
        };
      })
      .sort((a, b) => b.conversionPct - a.conversionPct);

    return { entries };
  } catch (e) {
    return {
      entries: [],
      error: e instanceof Error ? e.message : "Failed",
    };
  }
}

/** Theme (action category) acceptance stats for Drivers Effectiveness chart. */
export interface DriversEffectivenessEntry {
  theme: string;
  acceptedCount: number;
  totalCount: number;
  acceptancePct: number;
}

const THEME_ORDER: string[] = ["Collaboration", "Accountability", "Feedback", "Connection", "Coaching"];

/** Statuses for weekly action chart: accepted = engaged (did not skip). */
const WEEKLY_ACCEPTED_STATUSES = ["scheduled", "success", "failed"];
/** Statuses for weekly action chart: successful = validated/completed. */
const WEEKLY_SUCCESSFUL_STATUSES = ["success"];

export interface WeeklyActionChartEntry {
  weekNumber: number;
  name: string;
  accepted: number;
  skipped: number;
  successful: number;
}

/** Per-week action stats for Analytics tab. Each delivery = a week. Counts (accepted, skipped, successful) 
 * for actions in that delivery × users assigned to that package. E.g. 4 actions × 8 users = 32 slots; 
 * we count actual user_actions in each status bucket. */
export async function getWeeklyActionChartData(companyId?: string): Promise<{
  entries: WeeklyActionChartEntry[];
  error?: string;
}> {
  try {
    const { companyId: myCompanyId, role } = await getAdminContext();
    const resolvedCompanyId = role === "admin" ? myCompanyId : companyId;
    if (!resolvedCompanyId) {
      return { entries: [], error: "Company required" };
    }

    const admin = createAdminClient();

    const { data: packages } = await admin
      .from("packages")
      .select("id")
      .eq("company_id", resolvedCompanyId);
    const packageIds = (packages ?? []).map((p) => p.id);
    if (packageIds.length === 0) {
      return { entries: [] };
    }

    const { data: companyProfiles } = await admin
      .from("profiles")
      .select("id, role")
      .eq("company_id", resolvedCompanyId);
    const endUserIds = (companyProfiles ?? [])
      .filter((p: { role: string }) => p.role === "user")
      .map((p: { id: string }) => p.id);

    const { data: packageActions } = await admin
      .from("package_actions")
      .select("package_id, action_id, week_number")
      .in("package_id", packageIds);
    const { data: assignments } = await admin
      .from("package_assignments")
      .select("package_id, user_id")
      .in("package_id", packageIds);

    const filteredAssignments = (assignments ?? []).filter((a: { user_id: string }) =>
      endUserIds.includes(a.user_id)
    );

    if (endUserIds.length === 0 || !packageActions?.length) {
      return { entries: [] };
    }

    const slotsByWeek = new Map<number, Array<{ actionId: string; userId: string }>>();
    for (const pa of packageActions as { package_id: string; action_id: string; week_number: number | null }[]) {
      const week = pa.week_number ?? 1;
      const users = (filteredAssignments as { package_id: string; user_id: string }[])
        .filter((a) => a.package_id === pa.package_id)
        .map((a) => a.user_id);
      for (const uid of users) {
        const slots = slotsByWeek.get(week) ?? [];
        slots.push({ actionId: pa.action_id, userId: uid });
        slotsByWeek.set(week, slots);
      }
    }

    const { data: uaRows } = await admin
      .from("user_actions")
      .select("user_id, action_id, status")
      .in("user_id", endUserIds);

    const uaMap = new Map<string, string>();
    for (const ua of uaRows ?? []) {
      uaMap.set(`${ua.user_id}|${ua.action_id}`, ua.status);
    }

    const entries: WeeklyActionChartEntry[] = [];
    for (const [weekNum, slots] of slotsByWeek) {
      let accepted = 0;
      let skipped = 0;
      let successful = 0;
      for (const slot of slots) {
        const key = `${slot.userId}|${slot.actionId}`;
        const status = uaMap.get(key);
        if (!status) continue;
        if (status === "skipped") {
          skipped += 1;
        } else if (WEEKLY_ACCEPTED_STATUSES.includes(status)) {
          accepted += 1;
          if (WEEKLY_SUCCESSFUL_STATUSES.includes(status)) {
            successful += 1;
          }
        }
      }
      entries.push({
        weekNumber: weekNum,
        name: `Week ${weekNum}`,
        accepted,
        skipped,
        successful,
      });
    }
    entries.sort((a, b) => a.weekNumber - b.weekNumber);

    return { entries };
  } catch (e) {
    return {
      entries: [],
      error: e instanceof Error ? e.message : "Failed",
    };
  }
}

export interface WeeklyPointsChartEntry {
  weekNumber: number;
  name: string;
  totalPoints: number;
}

/** Per-week total points earned by all users from actions delivered in that week.
 * Points are computed from user_actions (read, accept, success, etc.) and attributed
 * to the earliest delivery week for each (user, action) slot to avoid double-counting. */
export async function getWeeklyPointsChartData(companyId?: string): Promise<{
  entries: WeeklyPointsChartEntry[];
  error?: string;
}> {
  try {
    const { companyId: myCompanyId, role } = await getAdminContext();
    const resolvedCompanyId = role === "admin" ? myCompanyId : companyId;
    if (!resolvedCompanyId) {
      return { entries: [], error: "Company required" };
    }

    const admin = createAdminClient();

    const { data: packages } = await admin
      .from("packages")
      .select("id")
      .eq("company_id", resolvedCompanyId);
    const packageIds = (packages ?? []).map((p) => p.id);
    if (packageIds.length === 0) {
      return { entries: [] };
    }

    const { data: companyProfiles } = await admin
      .from("profiles")
      .select("id, role")
      .eq("company_id", resolvedCompanyId);
    const endUserIds = (companyProfiles ?? [])
      .filter((p: { role: string }) => p.role === "user")
      .map((p: { id: string }) => p.id);

    const { data: packageActions } = await admin
      .from("package_actions")
      .select("package_id, action_id, week_number")
      .in("package_id", packageIds);
    const { data: assignments } = await admin
      .from("package_assignments")
      .select("package_id, user_id")
      .in("package_id", packageIds);

    const filteredAssignments = (assignments ?? []).filter((a: { user_id: string }) =>
      endUserIds.includes(a.user_id)
    );

    if (endUserIds.length === 0 || !packageActions?.length) {
      return { entries: [] };
    }

    const slotsByWeek = new Map<number, Array<{ actionId: string; userId: string }>>();
    const slotToEarliestWeek = new Map<string, number>();
    for (const pa of packageActions as { package_id: string; action_id: string; week_number: number | null }[]) {
      const week = pa.week_number ?? 1;
      const users = (filteredAssignments as { package_id: string; user_id: string }[])
        .filter((a) => a.package_id === pa.package_id)
        .map((a) => a.user_id);
      for (const uid of users) {
        const key = `${uid}|${pa.action_id}`;
        const existing = slotToEarliestWeek.get(key);
        if (existing == null || week < existing) {
          slotToEarliestWeek.set(key, week);
        }
        const slots = slotsByWeek.get(week) ?? [];
        slots.push({ actionId: pa.action_id, userId: uid });
        slotsByWeek.set(week, slots);
      }
    }

    const { data: uaRows } = await admin
      .from("user_actions")
      .select("user_id, action_id, status, is_calendar_synced")
      .in("user_id", endUserIds);

    const uaMap = new Map<string, { status: string; is_calendar_synced: boolean }>();
    for (const ua of uaRows ?? []) {
      uaMap.set(`${ua.user_id}|${ua.action_id}`, {
        status: ua.status,
        is_calendar_synced: !!ua.is_calendar_synced,
      });
    }

    const pointsByWeek = new Map<number, number>();
    for (const [slotKey, weekNum] of slotToEarliestWeek) {
      const ua = uaMap.get(slotKey);
      if (!ua) continue;

      const status = ua.status;
      const synced = ua.is_calendar_synced;

      let pts = 0;
      pts += getPointsForEvent("read");
      const wasAccepted = status === "scheduled" || status === "success" || status === "failed";
      if (wasAccepted) {
        pts += getPointsForEvent("accept", synced);
      }
      if (status === "skipped") {
        pts += getPointsForEvent("honesty_skip");
      }
      if (status === "failed") {
        pts += getPointsForEvent("inaction");
      }
      if (status === "success") {
        pts += getPointsForEvent("success");
      }

      pointsByWeek.set(weekNum, (pointsByWeek.get(weekNum) ?? 0) + pts);
    }

    const entries: WeeklyPointsChartEntry[] = [];
    for (const [weekNum, total] of pointsByWeek) {
      entries.push({
        weekNumber: weekNum,
        name: `Week ${weekNum}`,
        totalPoints: total,
      });
    }
    entries.sort((a, b) => a.weekNumber - b.weekNumber);

    return { entries };
  } catch (e) {
    return {
      entries: [],
      error: e instanceof Error ? e.message : "Failed",
    };
  }
}

/** Package history for Package Management tab - lists all deployed packages with stats. */
export interface PackageHistoryEntry {
  id: string;
  name: string;
  startDate: string | null;
  durationWeeks: number;
  actionsCount: number;
  usersAssigned: number;
  createdAt: string;
}

export async function getPackageHistory(companyId?: string): Promise<{
  packages: PackageHistoryEntry[];
  error?: string;
}> {
  try {
    const { companyId: myCompanyId, role } = await getAdminContext();
    const resolvedCompanyId = role === "admin" ? myCompanyId : companyId;
    if (!resolvedCompanyId) {
      return { packages: [], error: "Company required" };
    }

    const admin = createAdminClient();

    const { data: packagesData } = await admin
      .from("packages")
      .select("id, name, start_date, duration_weeks, created_at")
      .eq("company_id", resolvedCompanyId)
      .order("created_at", { ascending: false });

    if (!packagesData?.length) {
      return { packages: [] };
    }

    const packageIds = packagesData.map((p) => p.id);

    const { data: packageActions } = await admin
      .from("package_actions")
      .select("package_id")
      .in("package_id", packageIds);

    const { data: packageAssignments } = await admin
      .from("package_assignments")
      .select("package_id")
      .in("package_id", packageIds);

    const actionsCountByPackage = new Map<string, number>();
    const usersCountByPackage = new Map<string, number>();

    for (const pa of packageActions ?? []) {
      actionsCountByPackage.set(
        pa.package_id,
        (actionsCountByPackage.get(pa.package_id) ?? 0) + 1
      );
    }

    for (const assign of packageAssignments ?? []) {
      usersCountByPackage.set(
        assign.package_id,
        (usersCountByPackage.get(assign.package_id) ?? 0) + 1
      );
    }

    const packages: PackageHistoryEntry[] = packagesData.map((p) => ({
      id: p.id,
      name: p.name,
      startDate: p.start_date,
      durationWeeks: p.duration_weeks ?? 8,
      actionsCount: actionsCountByPackage.get(p.id) ?? 0,
      usersAssigned: usersCountByPackage.get(p.id) ?? 0,
      createdAt: p.created_at,
    }));

    return { packages };
  } catch (e) {
    return {
      packages: [],
      error: e instanceof Error ? e.message : "Failed",
    };
  }
}

/** Per-theme acceptance percentage across all company users (action themes = drivers). */
export async function getDriversEffectiveness(companyId?: string): Promise<{
  entries: DriversEffectivenessEntry[];
  error?: string;
}> {
  try {
    const { companyId: myCompanyId, role } = await getAdminContext();
    const resolvedCompanyId = role === "admin" ? myCompanyId : companyId;
    if (!resolvedCompanyId) {
      return { entries: [], error: "Company required" };
    }

    const admin = createAdminClient();

    const { data: companyProfiles } = await admin
      .from("profiles")
      .select("id, role")
      .eq("company_id", resolvedCompanyId);
    const userIds = (companyProfiles ?? [])
      .filter((p: { role: string }) => p.role === "user")
      .map((p: { id: string }) => p.id);

    const { data: actions } = await admin
      .from("actions")
      .select("id, theme")
      .eq("company_id", resolvedCompanyId);
    const actionIdToTheme = new Map<string, string>();
    for (const a of actions ?? []) {
      actionIdToTheme.set(a.id, a.theme as string);
    }

    const themeTotals = new Map<string, number>();
    const themeAccepted = new Map<string, number>();
    for (const t of THEME_ORDER) {
      themeTotals.set(t, 0);
      themeAccepted.set(t, 0);
    }

    // Denominator: (count of actions in theme) × (count of assigned users)
    const usersCount = userIds.length;
    for (const a of actions ?? []) {
      const theme = a.theme as string;
      if (!themeTotals.has(theme)) continue;
      themeTotals.set(theme, (themeTotals.get(theme) ?? 0) + 1);
    }
    for (const t of THEME_ORDER) {
      themeTotals.set(t, (themeTotals.get(t) ?? 0) * usersCount);
    }

    if (userIds.length > 0) {
      const { data: uaRows } = await admin
        .from("user_actions")
        .select("action_id, status")
        .in("user_id", userIds);

      for (const row of (uaRows ?? []) as { action_id: string; status: string }[]) {
        const theme = actionIdToTheme.get(row.action_id);
        if (!theme) continue;
        if (DRIVER_ACCEPTED_STATUSES.includes(row.status)) {
          const acc = (themeAccepted.get(theme) ?? 0) + 1;
          themeAccepted.set(theme, acc);
        }
      }
    }

    const entries: DriversEffectivenessEntry[] = THEME_ORDER.map((theme) => {
      const total = themeTotals.get(theme) ?? 0;
      const accepted = themeAccepted.get(theme) ?? 0;
      const acceptancePct = total > 0 ? Math.round((accepted / total) * 100) : 0;
      return { theme, acceptedCount: accepted, totalCount: total, acceptancePct };
    });

    return { entries };
  } catch (e) {
    return {
      entries: [],
      error: e instanceof Error ? e.message : "Failed",
    };
  }
}
