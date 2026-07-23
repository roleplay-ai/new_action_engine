"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculatePointsFromHistory } from "@/lib/points";
import { getMyCohorts } from "@/app/actions/cohorts";

export interface LeaderboardEntry {
  id: string;
  name: string;
  totalPoints: number;
  isCurrentUser: boolean;
}

/** Get company-scoped leaderboard by profile total_points (desc). Current user is marked with isCurrentUser. */
export async function getLeaderboard(): Promise<
  { entries: LeaderboardEntry[]; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { entries: [], error: "Not authenticated" };
    }

    const { data: myProfile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();

    const companyId = myProfile?.company_id ?? null;
    if (!companyId) {
      // No company: return only current user so they still see themselves
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, full_name, total_points")
        .eq("id", user.id)
        .single();
      if (!prof) return { entries: [] };
      const name = (prof.full_name?.trim() || user.email?.split("@")[0] || "You") as string;
      return {
        entries: [
          {
            id: prof.id,
            name,
            totalPoints: prof.total_points ?? 0,
            isCurrentUser: true,
          },
        ],
      };
    }

    // Admin client: profiles' RLS only allows reading your own row or (for
    // admins) same-company rows — a plain user reading fellow company
    // members' points has no covering SELECT policy and would otherwise be
    // silently filtered down to just themselves.
    const admin = createAdminClient();
    const { data: rows } = await admin
      .from("profiles")
      .select("id, full_name, total_points")
      .eq("company_id", companyId)
      .order("total_points", { ascending: false });

    const entries: LeaderboardEntry[] = (rows ?? []).map((row) => ({
      id: row.id,
      name: (row.full_name?.trim() || "Anonymous") as string,
      totalPoints: row.total_points ?? 0,
      isCurrentUser: row.id === user.id,
    }));

    return { entries };
  } catch (e) {
    return {
      entries: [],
      error: e instanceof Error ? e.message : "Failed to load leaderboard",
    };
  }
}

/** Cohort-scoped leaderboard calculated only from actions belonging to this cohort. */
export async function getCohortLeaderboard(cohortId: string): Promise<
  { entries: LeaderboardEntry[]; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { entries: [], error: "Not authenticated" };
    }

    const context = await getMyCohorts();
    if (context.error || !context.cohorts.some((cohort) => cohort.id === cohortId)) {
      return { entries: [], error: context.error ?? "You do not have access to this cohort" };
    }

    // Participant RLS exposes only their own cohort_members row, so use the
    // service client after the access check above to include the full cohort.
    const admin = createAdminClient();
    const { data: members } = await admin
      .from("cohort_members")
      .select("user_id")
      .eq("cohort_id", cohortId);
    const userIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
    if (!userIds.length) return { entries: [] };

    const [{ data: rows }, { data: cohortActions }] = await Promise.all([
      admin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds),
      admin
        .from("actions")
        .select("id")
        .eq("cohort_id", cohortId),
    ]);

    const actionIds = (cohortActions ?? []).map((action) => action.id);
    const { data: history } = actionIds.length
      ? await admin
          .from("user_actions")
          .select("user_id, status, is_calendar_synced")
          .in("user_id", userIds)
          .in("action_id", actionIds)
      : { data: [] };

    const historyByUser = new Map<string, { status: string; is_calendar_synced: boolean | null }[]>();
    for (const row of history ?? []) {
      const current = historyByUser.get(row.user_id) ?? [];
      current.push({ status: row.status, is_calendar_synced: row.is_calendar_synced });
      historyByUser.set(row.user_id, current);
    }

    const entries: LeaderboardEntry[] = (rows ?? []).map((row) => ({
      id: row.id,
      name: (row.full_name?.trim() || "Anonymous") as string,
      totalPoints: calculatePointsFromHistory(historyByUser.get(row.id) ?? []),
      isCurrentUser: row.id === user.id,
    })).sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name));

    return { entries };
  } catch (e) {
    return {
      entries: [],
      error: e instanceof Error ? e.message : "Failed to load cohort leaderboard",
    };
  }
}
