"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionTheme } from "@/lib/types";
import {
  generateDraftActions,
  computeNextDeliveryAt,
  draftsToActionRows,
  DEFAULT_BATCH_SIZE,
  buildTrainingContext,
  type DraftAction,
  type DeliveryTrack,
} from "@/lib/personal-action-generation";
import { istToUTCTime } from "@/lib/timezone-utils";

/** Generate a fresh batch of draft personal actions from the user's training answers. Does not persist anything. */
export async function generatePersonalActions(params: {
  trainingText: string;
  focusThemes: ActionTheme[];
  focusCustomText?: string;
}): Promise<{ drafts?: DraftAction[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Not authenticated" };
  }

  const contextText = buildTrainingContext(params.trainingText, params.focusThemes, params.focusCustomText);

  return generateDraftActions({
    trainingText: contextText,
    focusThemes: params.focusThemes,
    count: DEFAULT_BATCH_SIZE,
  });
}

/**
 * Persist accepted/edited drafts as personal actions. Only the first `dailyActionCount`
 * land in the user's library today — extras go to backlog for future deliveries.
 * Also sets up the recurring delivery subscription and marks onboarding complete.
 */
export async function saveGeneratedActions(params: {
  drafts: DraftAction[];
  trainingText: string;
  focusThemes: ActionTheme[];
  focusCustomText?: string;
  track: DeliveryTrack;
  dailyActionCount: 1 | 2 | 3;
  /** IST time (HH:MM) when the next batch should arrive. */
  deliveryTime: string;
  /** Required when track === "weekly". 0 = Sunday, ... 6 = Saturday. */
  daysOfWeek?: number[];
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
    if (
      params.track === "weekly" &&
      (!params.daysOfWeek?.length || params.daysOfWeek.some((d) => d < 0 || d > 6))
    ) {
      return { error: "Select at least one day for a weekly sprint" };
    }
    if (![1, 2, 3].includes(params.dailyActionCount)) {
      return { error: "Daily action count must be 1, 2, or 3" };
    }
    if (!params.deliveryTime?.trim()) {
      return { error: "Select a delivery time" };
    }

    const contextText = buildTrainingContext(params.trainingText, params.focusThemes, params.focusCustomText);
    const batchSize = params.dailyActionCount;
    const timeOfDayUtc = istToUTCTime(params.deliveryTime);
    const toDeliverNow = params.drafts.slice(0, batchSize);
    const toBacklog = params.drafts.slice(batchSize);

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

    const daysOfWeek =
      params.track === "weekly"
        ? [...new Set(params.daysOfWeek!)].sort((a, b) => a - b)
        : null;
    const { error: subError } = await supabase.from("personal_action_subscriptions").upsert(
      {
        user_id: user.id,
        training_text: contextText,
        focus_themes: params.focusThemes,
        track: params.track,
        day_of_week: daysOfWeek?.[0] ?? null,
        days_of_week: daysOfWeek,
        daily_action_count: batchSize,
        time_of_day_utc: timeOfDayUtc,
        is_active: true,
        next_delivery_at: computeNextDeliveryAt(params.track, daysOfWeek, timeOfDayUtc),
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
