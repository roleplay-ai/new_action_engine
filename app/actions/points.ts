"use server";

import { createClient } from "@/lib/supabase/server";
import { getPointsForEvent, getLeagueIndexFromPoints } from "@/lib/points";

type UserActionRow = {
  status: string;
  completed_reps: number | null;
  is_calendar_synced: boolean | null;
};

export async function syncMyTotalPointsFromHistory(): Promise<{ error?: string; total?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Not authenticated" };
  }

  const { data: userActions, error: actionsError } = await supabase
    .from("user_actions")
    .select("status, completed_reps, is_calendar_synced")
    .eq("user_id", user.id);

  if (actionsError) {
    return { error: actionsError.message };
  }

  let total = 0;
  for (const ua of (userActions ?? []) as UserActionRow[]) {
    const reps = Math.max(0, ua.completed_reps ?? 0);
    const status = ua.status;
    const synced = !!ua.is_calendar_synced;

    // Read is one-time per action row (first interaction creates row).
    total += getPointsForEvent("read");

    // Accept is one-time if action was accepted at any point.
    const wasAccepted =
      status === "scheduled" ||
      status === "success" ||
      status === "habit_started" ||
      status === "cemented" ||
      status === "failed";
    if (wasAccepted) {
      total += getPointsForEvent("accept", synced);
    }

    // Decline is one-time.
    if (status === "skipped") {
      total += getPointsForEvent("honesty_skip");
    }

    // Failed validation / no action taken.
    if (status === "failed") {
      total += getPointsForEvent("inaction");
    }

    // Each validated success adds +5.
    total += reps * getPointsForEvent("success");

    // Habit started bonus is one-time if user has at least one success.
    if (reps > 0) {
      total += getPointsForEvent("start_habit");
    }

    // Habit acquired bonus on cemented status.
    if (status === "cemented") {
      total += getPointsForEvent("cemented_habit");
    }
  }

  total = Math.max(0, total);

  // Fetch role so we only set league index for end-users (role = 'user').
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const updatePayload: Record<string, any> = {
    total_points: total,
    last_active_at: new Date().toISOString(),
  };

  if (profileRow?.role === "user") {
    updatePayload.league_index = getLeagueIndexFromPoints(total);
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("id", user.id);

  if (updateError) {
    return { error: updateError.message };
  }

  return { total };
}

export async function syncMyLeagueIndexFromPoints(): Promise<{ error?: string; leagueIndex?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Not authenticated" };
  }

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("role, total_points")
    .eq("id", user.id)
    .single();

  if (profileError || !profileRow) {
    return { error: profileError?.message ?? "Profile not found" };
  }

  const total = profileRow.total_points ?? 0;
  const leagueIndex = getLeagueIndexFromPoints(total);

  if (profileRow.role === "user") {
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ league_index: leagueIndex })
      .eq("id", user.id);

    if (updateError) {
      return { error: updateError.message };
    }
  }

  return { leagueIndex };
}
