"use server";

import { createClient } from "@/lib/supabase/server";
import { getPointsForEvent, getLeagueIndexFromPoints } from "@/lib/points";

type UserActionRow = {
  status: string;
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
    .select("status, is_calendar_synced")
    .eq("user_id", user.id);

  if (actionsError) {
    return { error: actionsError.message };
  }

  const { count: reminderCompletions } = await supabase
    .from("action_reminder_completions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  let total = 0;
  for (const ua of (userActions ?? []) as UserActionRow[]) {
    const status = ua.status;
    const synced = !!ua.is_calendar_synced;

    // Read is one-time per action row (first interaction creates row).
    total += getPointsForEvent("read");

    // Accept is one-time if action was accepted at any point.
    const wasAccepted = status === "scheduled" || status === "success" || status === "failed";
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

    // Validated success is one-time per action.
    if (status === "success") {
      total += getPointsForEvent("success");
    }
  }

  // Weekly reminder "mark done" check-ins, one success-equivalent each.
  total += (reminderCompletions ?? 0) * getPointsForEvent("success");

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
