"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { ActionTheme } from "@/lib/types";
import {
  computeNextDeliveryAt,
  computeTotalActionsNeeded,
  BACKGROUND_BATCH_SIZE,
  buildTrainingContext,
  type DeliveryTrack,
} from "@/lib/personal-action-generation";
import { istToUTCTime } from "@/lib/timezone-utils";

/**
 * Save the user's training context and sprint cadence, then kick off a background
 * job that generates the full plan's worth of actions in batches (see
 * app/api/generate-actions-batch/route.ts) and drops them straight into the
 * user's action library as they're ready. Marks onboarding complete immediately —
 * generation continues after this call returns.
 */
export async function saveGeneratedActions(params: {
  trainingText: string;
  focusThemes: ActionTheme[];
  focusCustomText?: string;
  track: DeliveryTrack;
  /** Actions generated per delivery. */
  dailyActionCount: 2 | 3 | 4;
  /** IST time (HH:MM) when the next batch should arrive. */
  deliveryTime: string;
  /** 0 = Sunday, ... 6 = Saturday. Multiple allowed for "daily", exactly one for "weekly". */
  daysOfWeek: number[];
  /** Length of the plan in weeks (2-24). Drives how many total actions get generated. */
  durationWeeks: number;
}): Promise<{ error?: string; totalActionsNeeded?: number }> {
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
    const uniqueDays = [...new Set(params.daysOfWeek ?? [])].sort((a, b) => a - b);
    if (!uniqueDays.length || uniqueDays.some((d) => d < 0 || d > 6)) {
      return { error: "Select at least one day" };
    }
    if (params.track === "weekly" && uniqueDays.length !== 1) {
      return { error: "Weekly sprint requires exactly one day" };
    }
    if (![2, 3, 4].includes(params.dailyActionCount)) {
      return { error: "Daily action count must be 2, 3, or 4" };
    }
    if (!params.deliveryTime?.trim()) {
      return { error: "Select a delivery time" };
    }
    if (!Number.isInteger(params.durationWeeks) || params.durationWeeks < 2 || params.durationWeeks > 24) {
      return { error: "Plan duration must be between 2 and 24 weeks" };
    }

    const contextText = buildTrainingContext(params.trainingText, params.focusThemes, params.focusCustomText);
    const timeOfDayUtc = istToUTCTime(params.deliveryTime);
    const totalActionsNeeded = computeTotalActionsNeeded(
      params.durationWeeks,
      params.dailyActionCount,
      params.track,
      uniqueDays
    );

    // is_active: true — the delivery cron (assignScheduledBatch) paces how
    // many of the already-generated actions become active at a time; it
    // never generates new ones itself, so it can't over-produce beyond the
    // plan total.
    const { error: subError } = await supabase.from("personal_action_subscriptions").upsert(
      {
        user_id: user.id,
        training_text: contextText,
        focus_themes: params.focusThemes,
        track: params.track,
        day_of_week: uniqueDays[0],
        days_of_week: uniqueDays,
        daily_action_count: params.dailyActionCount,
        time_of_day_utc: timeOfDayUtc,
        is_active: true,
        last_delivered_at: null,
        next_delivery_at: computeNextDeliveryAt(params.track, uniqueDays, timeOfDayUtc),
        duration_weeks: params.durationWeeks,
        total_actions_planned: totalActionsNeeded,
      },
      { onConflict: "user_id" }
    );
    if (subError) {
      return { error: subError.message };
    }

    const { data: job } = await supabase
      .from("personal_action_generation_jobs")
      .insert({
        user_id: user.id,
        training_text: contextText,
        focus_themes: params.focusThemes,
        total_needed: totalActionsNeeded,
        total_generated: 0,
        batch_size: BACKGROUND_BATCH_SIZE,
        status: "generating",
      })
      .select("id")
      .single();

    if (job?.id) {
      // Derive origin from the actual incoming request (not NEXT_PUBLIC_APP_URL,
      // which points at production and would misfire this self-trigger when
      // running locally or on a preview deployment).
      const hdrs = await headers();
      const host = hdrs.get("host");
      const proto = hdrs.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https");
      const origin = host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const cronSecret = process.env.CRON_SECRET;
      after(async () => {
        try {
          const res = await fetch(`${origin}/api/generate-actions-batch`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
            },
            body: JSON.stringify({ jobId: job.id }),
          });
          if (!res.ok) {
            await supabase
              .from("personal_action_generation_jobs")
              .update({ status: "failed", error_message: `Failed to start generation (HTTP ${res.status})`, updated_at: new Date().toISOString() })
              .eq("id", job.id);
          }
        } catch (e) {
          await supabase
            .from("personal_action_generation_jobs")
            .update({
              status: "failed",
              error_message: `Failed to reach ${origin}: ${e instanceof Error ? e.message : String(e)}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);
        }
      });
    }

    await supabase
      .from("profiles")
      .update({ self_onboarding_completed_at: new Date().toISOString() })
      .eq("id", user.id);

    return { totalActionsNeeded };
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

/** Latest background action-plan generation job for the current user, for live status polling. */
export async function getActiveGenerationJob(): Promise<{
  job: { totalNeeded: number; totalGenerated: number; status: string } | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { job: null };
  }

  const { data } = await supabase
    .from("personal_action_generation_jobs")
    .select("total_needed, total_generated, status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return { job: null };
  }

  return {
    job: {
      totalNeeded: data.total_needed,
      totalGenerated: data.total_generated,
      status: data.status,
    },
  };
}

/** Edit one of the current user's own AI-generated personal actions (e.g. from the library while generation is still in progress). */
export async function updatePersonalAction(
  id: string,
  params: {
    theme?: ActionTheme;
    title?: string;
    how?: string;
    why?: string;
    timeEstimate?: string;
  }
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { error: "Not authenticated" };
    }

    const updates: Record<string, unknown> = {};
    if (params.theme != null) updates.theme = params.theme;
    if (params.title != null) updates.title = params.title.trim();
    if (params.how != null) updates.how = params.how.trim();
    if (params.why != null) updates.why = params.why.trim();
    if (params.timeEstimate != null) updates.time_estimate = params.timeEstimate;

    const { error } = await supabase
      .from("actions")
      .update(updates)
      .eq("id", id)
      .eq("created_by", user.id)
      .eq("is_personal", true);

    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update action" };
  }
}

/** Delete one of the current user's own AI-generated personal actions from the library. */
export async function deletePersonalAction(id: string): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { error: "Not authenticated" };
    }

    const { error } = await supabase
      .from("actions")
      .delete()
      .eq("id", id)
      .eq("created_by", user.id)
      .eq("is_personal", true);

    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete action" };
  }
}
