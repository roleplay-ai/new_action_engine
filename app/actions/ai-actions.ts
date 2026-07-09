"use server";

import { createClient } from "@/lib/supabase/server";
import { istToUTCTime } from "@/lib/timezone-utils";
import type { ActionTheme } from "@/lib/types";
import {
  generateDraftActions,
  computeNextDeliveryAt,
  draftsToActionRows,
  BATCH_SIZE,
  type DraftAction,
  type DeliveryTrack,
} from "@/lib/personal-action-generation";

/** Generate a fresh batch of draft personal actions from the user's training answers. Does not persist anything. */
export async function generatePersonalActions(params: {
  trainingText: string;
  focusThemes: ActionTheme[];
}): Promise<{ drafts?: DraftAction[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Not authenticated" };
  }

  return generateDraftActions({
    trainingText: params.trainingText,
    focusThemes: params.focusThemes,
    count: BATCH_SIZE,
  });
}

/**
 * Persist accepted/edited drafts as personal actions. Only the first BATCH_SIZE
 * land in the user's library today (available same as any other unaccepted action,
 * not auto-scheduled) — any extras the user kept from "Generate more" are staged in
 * their backlog and consumed by future deliveries before generating fresh ones.
 * Also sets up the recurring delivery subscription (Daily/Weekly Sprint + time) and
 * marks onboarding complete.
 */
export async function saveGeneratedActions(params: {
  drafts: DraftAction[];
  trainingText: string;
  focusThemes: ActionTheme[];
  track: DeliveryTrack;
  timeIST: string;
  /** Required when track === "weekly". 0 = Sunday, ... 6 = Saturday. */
  dayOfWeek?: number;
}): Promise<{ error?: string; savedCount?: number; backlogCount?: number }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { error: "Not authenticated" };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();
    const companyId = profile?.company_id;
    if (!companyId) {
      return { error: "You must be assigned to a company first" };
    }

    if (params.track !== "daily" && params.track !== "weekly") {
      return { error: "Invalid track" };
    }
    if (params.track === "weekly" && (params.dayOfWeek == null || params.dayOfWeek < 0 || params.dayOfWeek > 6)) {
      return { error: "Day of week is required for a weekly sprint" };
    }

    const toDeliverNow = params.drafts.slice(0, BATCH_SIZE);
    const toBacklog = params.drafts.slice(BATCH_SIZE);

    if (toDeliverNow.length) {
      const rows = draftsToActionRows(toDeliverNow, companyId, user.id);
      const { error: insertError } = await supabase.from("actions").insert(rows);
      if (insertError) {
        return { error: insertError.message };
      }
    }

    if (toBacklog.length) {
      const backlogRows = toBacklog.map((d) => ({
        user_id: user.id,
        theme: d.theme,
        title: d.title.trim(),
        how: d.how.trim(),
        why: d.why.trim(),
        time_estimate: d.timeEstimate || "5 mins",
      }));
      const { error: backlogError } = await supabase.from("personal_action_backlog").insert(backlogRows);
      if (backlogError) {
        return { error: backlogError.message };
      }
    }

    const dayOfWeek = params.track === "weekly" ? params.dayOfWeek! : null;
    const { error: subError } = await supabase.from("personal_action_subscriptions").upsert(
      {
        user_id: user.id,
        training_text: params.trainingText,
        focus_themes: params.focusThemes,
        track: params.track,
        day_of_week: dayOfWeek,
        time_of_day_utc: istToUTCTime(params.timeIST),
        is_active: true,
        next_delivery_at: computeNextDeliveryAt(params.track, dayOfWeek),
      },
      { onConflict: "user_id" }
    );
    if (subError) {
      return { error: subError.message };
    }

    await supabase
      .from("profiles")
      .update({ self_onboarding_completed_at: new Date().toISOString() })
      .eq("id", user.id);

    return { savedCount: toDeliverNow.length, backlogCount: toBacklog.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save actions" };
  }
}

/** Dismiss the self-serve onboarding wizard without generating any actions. */
export async function skipSelfOnboarding(): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { error: "Not authenticated" };
    }

    await supabase
      .from("profiles")
      .update({ self_onboarding_completed_at: new Date().toISOString() })
      .eq("id", user.id);

    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}
