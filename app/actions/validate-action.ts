"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPointsForEvent } from "@/lib/points";

const REP_GOAL = 5; // Rule of 5

async function addPointsToProfile(userId: string, delta: number): Promise<void> {
  if (!delta) return;
  const supabase = await createClient();
  const { data: prof } = await supabase.from("profiles").select("total_points").eq("id", userId).single();
  if (!prof) return;
  await supabase
    .from("profiles")
    .update({
      total_points: Math.max(0, (prof.total_points || 0) + delta),
      last_active_at: new Date().toISOString(),
    })
    .eq("id", userId);
}

export async function validateAction(
  userActionId: string,
  success: boolean,
  reflection?: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Not authenticated" };
  }

  const { data: ua, error: fetchError } = await supabase
    .from("user_actions")
    .select("id, action_id, status, completed_reps, reps_remaining")
    .eq("id", userActionId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !ua) {
    return { error: "User action not found" };
  }

  const { data: action } = await supabase
    .from("actions")
    .select("title")
    .eq("id", ua.action_id)
    .single();

  const actionTitle = action?.title ?? "Action";

  if (!success) {
    await supabase
      .from("user_actions")
      .update({ status: "failed", reflection: reflection || null, updated_at: new Date().toISOString() })
      .eq("id", userActionId);

    // Inaction deduction applies only when transitioning into failed.
    if (ua.status !== "failed") {
      await addPointsToProfile(user.id, getPointsForEvent("inaction"));
    }

    revalidatePath("/");
    return {};
  }

  // Success path - Habit Loop (Rule of 5)
  const isHabit = ua.status === "habit_started";
  const completedReps = (ua.completed_reps ?? 0) + 1;
  // reps_remaining = how many more validations until cement (start 5, decrement each success)
  const currentRepsRemaining = ua.reps_remaining ?? REP_GOAL;
  const newRepsRemaining = isHabit ? Math.max(0, currentRepsRemaining - 1) : REP_GOAL - 1;
  const isCemented = newRepsRemaining <= 0;

  const newStatus = isCemented ? "cemented" : "habit_started";
  const isFirstHabit = !isHabit; // transitioning from scheduled to habit_started

  let points = getPointsForEvent("success");
  if (isCemented) {
    points += getPointsForEvent("cemented_habit");
  } else if (isFirstHabit) {
    points += getPointsForEvent("start_habit");
  }

  await supabase
    .from("user_actions")
    .update({
      status: newStatus,
      reflection: reflection || null,
      completed_reps: completedReps,
      reps_remaining: isCemented ? null : newRepsRemaining,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userActionId);

  // Mark the due habit occurrence as completed (so it drops from the queue)
  if (success && isHabit) {
    const nowISO = new Date().toISOString();
    const { data: dueOcc } = await supabase
      .from("habit_occurrences")
      .select("id")
      .eq("user_action_id", userActionId)
      .is("completed_at", null)
      .lte("scheduled_at", nowISO)
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .single();
    if (dueOcc?.id) {
      await supabase
        .from("habit_occurrences")
        .update({ completed_at: nowISO })
        .eq("id", dueOcc.id);
    }
  }

  await addPointsToProfile(user.id, points);

  const feedType = isCemented ? "CEMENTED" : isFirstHabit ? "HABIT_STARTED" : "SUCCESS";
  await supabase.from("feed_events").insert({
    user_id: user.id,
    action_title: actionTitle,
    type: feedType,
  });

  revalidatePath("/");
  return {};
}
