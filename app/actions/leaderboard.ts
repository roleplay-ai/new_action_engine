"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

/** Cohort-scoped leaderboard by profile total_points (desc). Current user is marked with isCurrentUser. */
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

    const { data: members } = await supabase
      .from("cohort_members")
      .select("user_id")
      .eq("cohort_id", cohortId);
    const userIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
    if (!userIds.length) return { entries: [] };

    // Admin client: same profiles-RLS gap as getLeaderboard() above.
    const admin = createAdminClient();
    const { data: rows } = await admin
      .from("profiles")
      .select("id, full_name, total_points")
      .in("id", userIds)
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
      error: e instanceof Error ? e.message : "Failed to load cohort leaderboard",
    };
  }
}
