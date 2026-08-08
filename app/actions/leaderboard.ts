"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface LeaderboardEntry {
  id: string;
  name: string;
  totalPoints: number;
  isCurrentUser: boolean;
}

export interface CohortWalletSummary {
  totalPoints: number;
  myContribution: number;
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

    // Equivalent access check to getMyCohorts() (member, or admin/creator of the
    // cohort's company) but scoped to just this one cohort instead of resolving
    // and re-ranking the user's entire cohort list (~6-7 queries) just to confirm
    // membership in a cohortId the caller already legitimately holds.
    const admin = createAdminClient();
    const [{ data: profile }, { data: cohortRow }, { data: membership }] = await Promise.all([
      supabase.from("profiles").select("role, company_id").eq("id", user.id).single(),
      admin.from("cohorts").select("company_id, created_by").eq("id", cohortId).maybeSingle(),
      admin.from("cohort_members").select("user_id").eq("cohort_id", cohortId).eq("user_id", user.id).maybeSingle(),
    ]);
    const hasAccess = !!membership
      || (!!profile?.company_id && profile.role === "admin" && cohortRow?.company_id === profile.company_id)
      || cohortRow?.created_by === user.id;
    if (!cohortRow || !hasAccess) {
      return { entries: [], error: "You do not have access to this cohort" };
    }

    // Participant RLS exposes only their own cohort_members row, so use the
    // service client after the access check above to include the full cohort.
    const { data: members } = await admin
      .from("cohort_members")
      .select("user_id")
      .eq("cohort_id", cohortId);
    const userIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
    if (!userIds.length) return { entries: [] };

    const [{ data: rows }, { data: accounts }] = await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds),
      admin
        .from("cohort_point_accounts")
        .select("user_id, current_points")
        .eq("cohort_id", cohortId)
        .in("user_id", userIds),
    ]);
    const pointsByUser = new Map((accounts ?? []).map((account) => [account.user_id, account.current_points]));

    const entries: LeaderboardEntry[] = (rows ?? []).map((row) => ({
      id: row.id,
      name: (row.full_name?.trim() || "Anonymous") as string,
      // Cohort members begin at 1,000; the persisted account appears once a
      // plan has actions and remains the authoritative score thereafter.
      totalPoints: pointsByUser.get(row.id) ?? 1000,
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

/** Aggregate-only cohort wallet data. Individual participant balances remain private. */
export async function getCohortWalletSummary(cohortId: string): Promise<{
  summary: CohortWalletSummary | null;
  error?: string;
}> {
  const result = await getCohortLeaderboard(cohortId);
  if (result.error) return { summary: null, error: result.error };

  return {
    summary: {
      totalPoints: result.entries.reduce((total, entry) => total + entry.totalPoints, 0),
      myContribution: result.entries.find((entry) => entry.isCurrentUser)?.totalPoints ?? 0,
    },
  };
}
