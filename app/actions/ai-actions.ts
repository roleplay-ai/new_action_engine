"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { ActionTheme } from "@/lib/types";
import {
  computeNextDeliveryAt,
  computeTotalActionsNeeded,
  advanceNextDeliveryAt,
  BACKGROUND_BATCH_SIZE,
  buildTrainingContext,
  DAILY_DELIVERY_DAYS,
  draftsToActionRows,
  generateDraftActions,
  type DeliveryTrack,
} from "@/lib/personal-action-generation";
import { istToUTCTime, utcToISTTime } from "@/lib/timezone-utils";
import { getMyCohorts } from "@/app/actions/cohorts";

export type MyPlanSettings = {
  track: DeliveryTrack;
  actionCount: number;
  durationWeeks: number;
  daysOfWeek: number[];
  reminderTime: string;
  totalActionsPlanned: number;
  nextDeliveryAt: string | null;
  emailRemindersEnabled: boolean;
  isActive: boolean;
  isArchived: boolean;
};

export type DraftPlanScheduleSlot = {
  plannedAt: string;
  isImmediate: boolean;
  batchNumber: number;
};

async function getSelectedPlanCohort(requireCurrent = false): Promise<{ cohortId?: string; error?: string }> {
  const context = await getMyCohorts();
  if (context.error) return { error: context.error };
  const selected = context.cohorts.find((cohort) => cohort.isSelected);
  if (!selected) return { error: "Select a cohort first" };
  if (requireCurrent && !selected.isCurrent) return { error: "New plans can only be built for your current cohort" };
  return { cohortId: selected.id };
}

export async function getMyPlanSettings(): Promise<{ settings: MyPlanSettings | null; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { settings: null, error: "Not authenticated" };
  const cohortContext = await getSelectedPlanCohort();
  if (!cohortContext.cohortId) return { settings: null, error: cohortContext.error };
  const { data, error } = await supabase.from("personal_action_subscriptions")
    .select("track, daily_action_count, duration_weeks, days_of_week, day_of_week, time_of_day_utc, total_actions_planned, next_delivery_at, email_reminders_enabled, is_active, archived_at")
    .eq("user_id", user.id)
    .eq("cohort_id", cohortContext.cohortId)
    .maybeSingle();
  if (error) return { settings: null, error: error.message };
  if (!data) return { settings: null };
  return { settings: {
    track: data.track as DeliveryTrack,
    actionCount: data.daily_action_count ?? 1,
    durationWeeks: data.duration_weeks ?? 0,
    daysOfWeek: data.days_of_week ?? (data.day_of_week != null ? [data.day_of_week] : []),
    reminderTime: utcToISTTime(data.time_of_day_utc),
    totalActionsPlanned: data.total_actions_planned ?? 0,
    nextDeliveryAt: data.next_delivery_at ?? null,
    emailRemindersEnabled: data.email_reminders_enabled !== false,
    isActive: data.is_active === true,
    isArchived: !!data.archived_at,
  } };
}

/** Preview the release slots a reviewed draft will use when it is finalised. */
export async function getDraftPlanSchedule(): Promise<{
  slots: DraftPlanScheduleSlot[];
  actionCountPerRelease: number;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { slots: [], actionCountPerRelease: 1, error: "Not authenticated" };
    const cohortContext = await getSelectedPlanCohort(true);
    if (!cohortContext.cohortId) return { slots: [], actionCountPerRelease: 1, error: cohortContext.error };

    const [{ data: subscription, error: subscriptionError }, { count, error: actionError }] = await Promise.all([
      supabase
        .from("personal_action_subscriptions")
        .select("track, day_of_week, days_of_week, daily_action_count, time_of_day_utc, is_active, archived_at")
        .eq("user_id", user.id)
        .eq("cohort_id", cohortContext.cohortId)
        .maybeSingle(),
      supabase
        .from("actions")
        .select("id", { count: "exact", head: true })
        .eq("created_by", user.id)
        .eq("cohort_id", cohortContext.cohortId)
        .eq("is_personal", true),
    ]);
    if (subscriptionError || actionError) {
      return { slots: [], actionCountPerRelease: 1, error: subscriptionError?.message ?? actionError?.message };
    }
    if (!subscription || subscription.is_active || subscription.archived_at) {
      return { slots: [], actionCountPerRelease: 1, error: "Only draft plans have a schedule preview" };
    }

    const actionCountPerRelease = Math.max(1, subscription.daily_action_count ?? 1);
    const daysOfWeek = subscription.days_of_week ?? (subscription.day_of_week != null ? [subscription.day_of_week] : null);
    const firstCadenceAt = computeNextDeliveryAt(
      subscription.track as DeliveryTrack,
      daysOfWeek,
      subscription.time_of_day_utc
    );
    const releaseDates: string[] = [];
    let nextRelease = firstCadenceAt;
    const batchCount = Math.ceil((count ?? 0) / actionCountPerRelease);
    // Every batch follows the chosen cadence. Daily plans begin on the next
    // weekday; weekly plans begin on the next selected weekday.
    for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
      releaseDates.push(nextRelease);
      nextRelease = advanceNextDeliveryAt(
        nextRelease,
        subscription.track as DeliveryTrack,
        daysOfWeek,
        subscription.time_of_day_utc
      );
    }

    return {
      actionCountPerRelease,
      slots: Array.from({ length: count ?? 0 }, (_, index) => {
        const batchNumber = Math.floor(index / actionCountPerRelease) + 1;
        return {
          plannedAt: releaseDates[batchNumber - 1],
          isImmediate: false,
          batchNumber,
        };
      }),
    };
  } catch (error) {
    return {
      slots: [],
      actionCountPerRelease: 1,
      error: error instanceof Error ? error.message : "Failed to preview the plan schedule",
    };
  }
}

/**
 * Save a draft plan and generate its actions in the background. The subscription
 * remains inactive until the participant reviews the actions and explicitly
 * finalises the plan with activatePersonalActionPlan.
 */
export async function saveGeneratedActions(params: {
  trainingText: string;
  focusThemes: ActionTheme[];
  focusCustomText?: string;
  track: DeliveryTrack;
  /** Actions generated per delivery. */
  dailyActionCount: 1 | 2 | 3 | 4 | 5;
  /** 0 = Sunday, ... 6 = Saturday. Multiple allowed for "daily", exactly one for "weekly". */
  daysOfWeek: number[];
  /** Length of the plan in weeks (2-24). Drives how many total actions get generated. */
  durationWeeks: number;
  /** Whether action reminders should also be delivered by email. */
  emailRemindersEnabled: boolean;
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

    const cohortContext = await getSelectedPlanCohort(true);
    if (!cohortContext.cohortId) return { error: cohortContext.error };
    const cohortId = cohortContext.cohortId;

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();
    const companyId = profile?.company_id;
    if (!companyId) {
      return { error: "You must be assigned to a company first" };
    }

    const { data: existingPlan } = await supabase
      .from("personal_action_subscriptions")
      .select("is_active, archived_at")
      .eq("user_id", user.id)
      .eq("cohort_id", cohortId)
      .maybeSingle();
    if (existingPlan?.is_active || existingPlan?.archived_at) {
      return { error: "This cohort plan has already been finalised and cannot be edited" };
    }

    if (params.track !== "daily" && params.track !== "weekly") {
      return { error: "Invalid track" };
    }
    // Daily plans run Monday-Friday. Weekly plans use exactly one chosen reminder day.
    const uniqueDays = params.track === "daily"
      ? [...DAILY_DELIVERY_DAYS]
      : [...new Set(params.daysOfWeek ?? [])].sort((a, b) => a - b);
    if (!uniqueDays.length || uniqueDays.some((d) => d < 0 || d > 6)) {
      return { error: "Select at least one day" };
    }
    if (params.track === "weekly" && uniqueDays.length !== 1) {
      return { error: "Weekly sprint requires exactly one day" };
    }
    if (![1, 2, 3, 4, 5].includes(params.dailyActionCount)) {
      return { error: "Action count must be between 1 and 5" };
    }
    if (!Number.isInteger(params.durationWeeks) || params.durationWeeks < 2 || params.durationWeeks > 24) {
      return { error: "Plan duration must be between 2 and 24 weeks" };
    }

    const contextText = buildTrainingContext(params.trainingText, params.focusThemes, params.focusCustomText);
    // The free Vercel cron runs once daily at 11:30 AM IST. Enforce that
    // server-side so older or custom clients cannot submit an unsupported time.
    const timeOfDayUtc = istToUTCTime("11:30");
    const totalActionsNeeded = computeTotalActionsNeeded(
      params.durationWeeks,
      params.dailyActionCount,
      params.track,
      uniqueDays
    );

    // Changing a draft replaces that cohort's unfinished generation rather
    // than mixing two different setup choices into one plan.
    if (existingPlan) {
      await supabase
        .from("personal_action_generation_jobs")
        .update({ status: "failed", error_message: "Replaced by a newer draft", updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("cohort_id", cohortId)
        .eq("status", "generating");
      await supabase
        .from("actions")
        .delete()
        .eq("created_by", user.id)
        .eq("cohort_id", cohortId)
        .eq("is_personal", true);
    }

    // Draft only: no actions are delivered until the participant reviews and
    // activates the plan.
    const { error: subError } = await supabase.from("personal_action_subscriptions").upsert(
      {
        user_id: user.id,
        cohort_id: cohortId,
        training_text: contextText,
        focus_themes: params.focusThemes,
        track: params.track,
        day_of_week: uniqueDays[0],
        days_of_week: uniqueDays,
        daily_action_count: params.dailyActionCount,
        time_of_day_utc: timeOfDayUtc,
        is_active: false,
        last_delivered_at: null,
        next_delivery_at: computeNextDeliveryAt(params.track, uniqueDays, timeOfDayUtc),
        duration_weeks: params.durationWeeks,
        total_actions_planned: totalActionsNeeded,
        email_reminders_enabled: params.emailRemindersEnabled,
        last_reminder_sent_date: null,
      },
      { onConflict: "user_id,cohort_id" }
    );
    if (subError) {
      return { error: subError.message };
    }

    const { data: job } = await supabase
      .from("personal_action_generation_jobs")
      .insert({
        user_id: user.id,
        cohort_id: cohortId,
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

    return { totalActionsNeeded };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save actions" };
  }
}

/** Finalise a reviewed draft and activate its future delivery cadence. */
export async function activatePersonalActionPlan(): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };
    const cohortContext = await getSelectedPlanCohort(true);
    if (!cohortContext.cohortId) return { error: cohortContext.error };

    const { data: sub, error } = await supabase
      .from("personal_action_subscriptions")
      .select("id, user_id, cohort_id, track, day_of_week, days_of_week, daily_action_count, time_of_day_utc, next_delivery_at, archived_at")
      .eq("user_id", user.id)
      .eq("cohort_id", cohortContext.cohortId)
      .maybeSingle();
    if (error || !sub) return { error: error?.message ?? "Create a plan first" };
    if (sub.archived_at) return { error: "Archived plans cannot be reactivated" };

    const nextDeliveryAt = computeNextDeliveryAt(
      sub.track as DeliveryTrack,
      sub.days_of_week ?? (sub.day_of_week != null ? [sub.day_of_week] : null),
      sub.time_of_day_utc
    );
    const { error: updateError } = await supabase
      .from("personal_action_subscriptions")
      .update({ is_active: true, next_delivery_at: nextDeliveryAt, last_delivered_at: null, updated_at: new Date().toISOString() })
      .eq("id", sub.id);
    if (updateError) return { error: updateError.message };

    await supabase.from("profiles").update({ self_onboarding_completed_at: new Date().toISOString() }).eq("id", user.id);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to activate plan" };
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
  const cohortContext = await getSelectedPlanCohort();
  if (!cohortContext.cohortId) return { job: null };

  const { data } = await supabase
    .from("personal_action_generation_jobs")
    .select("total_needed, total_generated, status")
    .eq("user_id", user.id)
    .eq("cohort_id", cohortContext.cohortId)
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

/** Persist the exact sequence chosen on the draft review screen. */
export async function reorderPersonalActions(actionIds: string[]): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { error: "Not authenticated" };
    const cohortContext = await getSelectedPlanCohort(true);
    if (!cohortContext.cohortId) return { error: cohortContext.error };

    const { data: plan } = await supabase
      .from("personal_action_subscriptions")
      .select("is_active, archived_at")
      .eq("user_id", user.id)
      .eq("cohort_id", cohortContext.cohortId)
      .maybeSingle();
    if (!plan || plan.is_active || plan.archived_at) return { error: "Finalised plans are view-only" };

    const { error: reorderError } = await supabase.rpc("reorder_my_draft_personal_actions", {
      p_cohort_id: cohortContext.cohortId,
      p_action_ids: actionIds,
    });
    if (reorderError) return { error: reorderError.message };
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to reorder actions" };
  }
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

    const { data: action } = await supabase
      .from("actions")
      .select("cohort_id")
      .eq("id", id)
      .eq("created_by", user.id)
      .eq("is_personal", true)
      .maybeSingle();
    if (!action?.cohort_id) return { error: "Action not found" };
    const { data: plan } = await supabase
      .from("personal_action_subscriptions")
      .select("is_active, archived_at")
      .eq("user_id", user.id)
      .eq("cohort_id", action.cohort_id)
      .maybeSingle();
    if (!plan || plan.is_active || plan.archived_at) return { error: "Finalised plans are view-only" };

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

/**
 * Append one extra AI-generated action to a draft plan while the participant
 * is still reviewing/editing. Finalised and archived plans stay view-only.
 */
export async function generateOneMorePersonalAction(): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return { error: "Not authenticated" };

    const cohortContext = await getSelectedPlanCohort(true);
    if (!cohortContext.cohortId) return { error: cohortContext.error };
    const cohortId = cohortContext.cohortId;

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();
    const companyId = profile?.company_id;
    if (!companyId) return { error: "You must be assigned to a company first" };

    const { data: plan } = await supabase
      .from("personal_action_subscriptions")
      .select("id, training_text, focus_themes, is_active, archived_at, total_actions_planned")
      .eq("user_id", user.id)
      .eq("cohort_id", cohortId)
      .maybeSingle();
    if (!plan) return { error: "Create a plan first" };
    if (plan.is_active || plan.archived_at) return { error: "Finalised plans are view-only" };

    const { data: activeJob } = await supabase
      .from("personal_action_generation_jobs")
      .select("id")
      .eq("user_id", user.id)
      .eq("cohort_id", cohortId)
      .eq("status", "generating")
      .limit(1)
      .maybeSingle();
    if (activeJob) return { error: "Wait for the current generation to finish" };

    const { data: existingActions, error: existingError } = await supabase
      .from("actions")
      .select("title, plan_order")
      .eq("created_by", user.id)
      .eq("cohort_id", cohortId)
      .eq("is_personal", true)
      .order("plan_order", { ascending: false, nullsFirst: false });
    if (existingError) return { error: existingError.message };

    const avoidTitles = (existingActions ?? []).map((action) => action.title).filter(Boolean);
    const nextPlanOrder = ((existingActions ?? [])[0]?.plan_order ?? -1) + 1;
    const focusThemes = (plan.focus_themes ?? []) as ActionTheme[];

    const { drafts, error: generateError } = await generateDraftActions({
      trainingText: plan.training_text ?? "",
      focusThemes,
      count: 1,
      avoidTitles,
    });
    if (generateError || !drafts?.length) {
      return { error: generateError ?? "AI did not return an action" };
    }

    const rows = draftsToActionRows(drafts.slice(0, 1), companyId, user.id, cohortId, nextPlanOrder);
    const { error: insertError } = await supabase.from("actions").insert(rows);
    if (insertError) return { error: insertError.message };

    const totalActions = (existingActions?.length ?? 0) + 1;
    await supabase
      .from("personal_action_subscriptions")
      .update({
        total_actions_planned: Math.max(plan.total_actions_planned ?? 0, totalActions),
        updated_at: new Date().toISOString(),
      })
      .eq("id", plan.id);

    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to generate another action" };
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

    const { data: action } = await supabase
      .from("actions")
      .select("cohort_id")
      .eq("id", id)
      .eq("created_by", user.id)
      .eq("is_personal", true)
      .maybeSingle();
    if (!action?.cohort_id) return { error: "Action not found" };
    const { data: plan } = await supabase
      .from("personal_action_subscriptions")
      .select("is_active, archived_at")
      .eq("user_id", user.id)
      .eq("cohort_id", action.cohort_id)
      .maybeSingle();
    if (!plan || plan.is_active || plan.archived_at) return { error: "Finalised plans are view-only" };

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
