"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPointsForEvent } from "@/lib/points";

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
    .select("id, action_id, status")
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

  await supabase
    .from("user_actions")
    .update({
      status: "success",
      reflection: reflection || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userActionId);

  await addPointsToProfile(user.id, getPointsForEvent("success"));

  await supabase.from("feed_events").insert({
    user_id: user.id,
    action_title: actionTitle,
    type: "SUCCESS",
  });

  revalidatePath("/");
  return {};
}
