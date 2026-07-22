import { Type } from "@google/genai";
import { getGeminiClient, isGeminiConfigured, GEMINI_MODEL } from "@/lib/gemini";
import { ACTION_DECK } from "@/lib/constants";
import type { ActionTheme } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { IST_OFFSET_MINUTES, getCurrentISTDate, getCurrentISTTime, utcToISTDate, utcToISTTime, utcToISTDateTime, istToUTCDateTime } from "@/lib/timezone-utils";

export type DraftAction = {
  theme: ActionTheme;
  title: string;
  how: string;
  why: string;
  timeEstimate: string;
};

export const THEMES: ActionTheme[] = ["Collaboration", "Feedback", "Accountability", "Connection", "Coaching"];

/** Default batch size for the interactive onboarding preview (before a plan duration is chosen). */
export const DEFAULT_BATCH_SIZE = 3;
/** @deprecated Use daily_action_count from subscription; kept for generation preview batches. */
export const BATCH_SIZE = DEFAULT_BATCH_SIZE;
/** Actions generated per call when background-filling a full multi-week plan. */
export const BACKGROUND_BATCH_SIZE = 12;

const draftSchema = {
  type: Type.OBJECT,
  properties: {
    actions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          theme: { type: Type.STRING, enum: THEMES },
          title: { type: Type.STRING },
          how: { type: Type.STRING },
          why: { type: Type.STRING },
          timeEstimate: { type: Type.STRING },
        },
        required: ["theme", "title", "how", "why", "timeEstimate"],
      },
    },
  },
  required: ["actions"],
};

/** Weekly: duration x actions/week. Daily: duration x actions/day x 7 days. */
export function computeTotalActionsNeeded(
  durationWeeks: number,
  dailyActionCount: number,
  track: DeliveryTrack,
  daysOfWeek?: number[] | null
): number {
  const activeDaysPerWeek = track === "daily" ? 7 : 1;
  return durationWeeks * dailyActionCount * activeDaysPerWeek;
}

export function buildTrainingContext(
  trainingText: string,
  focusThemes: ActionTheme[],
  focusCustomText?: string
): string {
  const parts: string[] = [];
  const base = trainingText.trim();
  if (base) parts.push(base);
  if (focusThemes.length) {
    parts.push(`Focus areas: ${focusThemes.join(", ")}`);
  }
  const custom = focusCustomText?.trim();
  if (custom) {
    parts.push(`Additional focus: ${custom}`);
  }
  return parts.join("\n\n");
}

function buildPrompt(
  trainingText: string,
  focusThemes: ActionTheme[],
  count: number,
  avoidTitles?: string[]
): string {
  const examples = ACTION_DECK.filter(
    (a) => focusThemes.length === 0 || focusThemes.includes(a.theme)
  ).slice(0, 4);
  const exampleBlock = (examples.length ? examples : ACTION_DECK.slice(0, 3))
    .map(
      (a) =>
        `- Theme: ${a.theme}\n  Title: ${a.title}\n  How: ${a.how}\n  Why: ${a.why}\n  Time: ${a.timeEstimate}`
    )
    .join("\n\n");

  const avoidBlock = avoidTitles?.length
    ? `\n\nActions already suggested to this user — do NOT repeat these or close variants of them:\n${avoidTitles.map((t) => `- ${t}`).join("\n")}`
    : "";

  return `You are the Nudgeable Action Engine, a behavioral science coach that turns training into small, concrete on-the-job micro-actions.

A user completed training and answered:
- What training did you do: "${trainingText.trim() || "(not specified)"}"
- Focus areas they want to work on: ${focusThemes.length ? focusThemes.join(", ") : "(no preference)"}

Here are examples of the format and tone we use for micro-actions:

${exampleBlock}

Generate ${count} NEW micro-actions tailored to this user's training and focus areas. Each action must:
- Have a "title" that is a concrete, specific behavior (not vague advice).
- Have a "how" that is a literal, tactical script or step the user can do today.
- Have a "why" that is a single sentence of behavioral-science rationale.
- Have a "timeEstimate" like "2 mins", "5 mins", "15 mins", or "30 mins".
- Have a "theme" that is exactly one of: ${THEMES.join(", ")}.
Prefer themes from the user's stated focus areas when possible. Do not repeat actions already suggested before.${avoidBlock}`;
}

/** Calls Gemini to draft `count` new personal actions. Does not persist anything. */
export async function generateDraftActions(params: {
  trainingText: string;
  focusThemes: ActionTheme[];
  count?: number;
  avoidTitles?: string[];
}): Promise<{ drafts?: DraftAction[]; error?: string }> {
  try {
    if (!isGeminiConfigured()) {
      return { error: "AI generation is not configured (GEMINI_API_KEY missing)" };
    }

    const count = params.count ?? DEFAULT_BATCH_SIZE;
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: buildPrompt(params.trainingText, params.focusThemes, count, params.avoidTitles),
      config: {
        responseMimeType: "application/json",
        responseSchema: draftSchema,
      },
    });

    const text = response.text;
    if (!text) {
      return { error: "AI returned an empty response" };
    }

    let parsed: { actions?: DraftAction[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      return { error: "AI returned malformed output" };
    }

    const drafts = (parsed.actions ?? []).filter(
      (a) => a && a.title && a.how && a.why && a.theme
    );
    if (!drafts.length) {
      return { error: "AI did not return any actions" };
    }

    return {
      drafts: drafts.map((a) => ({
        theme: a.theme,
        title: a.title.trim(),
        how: a.how.trim(),
        why: a.why.trim(),
        timeEstimate: a.timeEstimate?.trim() || "5 mins",
      })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to generate actions" };
  }
}

// ── Delivery cadence helpers (IST calendar) ──────────────────────────────────

/** Add N days to YYYY-MM-DD, return YYYY-MM-DD. */
function addDaysToISTDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if ([y, m, d].some(Number.isNaN)) return dateStr;
  const d0 = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  d0.setUTCDate(d0.getUTCDate() + days);
  const yy = d0.getUTCFullYear();
  const mm = String(d0.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d0.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Weekday in IST for date YYYY-MM-DD (0 = Sunday, 1 = Monday, ... 6 = Saturday). */
function getWeekdayIST(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  if ([y, m, d].some(Number.isNaN)) return 0;
  const utcMidnight = Date.UTC(y, m - 1, d, 0, 0, 0);
  const istMidnight = utcMidnight - IST_OFFSET_MINUTES * 60 * 1000;
  const utcDay = new Date(istMidnight).getUTCDay();
  return (utcDay + 1) % 7;
}

export type DeliveryTrack = "daily" | "weekly";

function normaliseDaysOfWeek(days: number[] | null | undefined): number[] {
  const unique = [...new Set((days ?? []).filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
  return unique.length ? unique : [1];
}

/** Days until the next selected weekday strictly after `fromDate` (IST). */
function daysUntilNextWeeklyDayAfter(fromDate: string, daysOfWeek: number[]): number {
  const sorted = normaliseDaysOfWeek(daysOfWeek);
  const fromDow = getWeekdayIST(fromDate);
  for (const target of sorted) {
    if (target > fromDow) return target - fromDow;
  }
  return 7 - fromDow + sorted[0];
}

/** Days until the next selected weekday on or after `fromDate` (IST), if time still allows today. */
function daysUntilNextWeeklyDay(
  fromDate: string,
  daysOfWeek: number[],
  istTime: string,
  fromTime?: string
): number {
  const sorted = normaliseDaysOfWeek(daysOfWeek);
  const fromDow = getWeekdayIST(fromDate);
  const nowTime = fromTime ?? getCurrentISTTime();

  if (sorted.includes(fromDow) && istTime > nowTime) {
    return 0;
  }

  for (const target of sorted) {
    if (target > fromDow) return target - fromDow;
  }
  return 7 - fromDow + sorted[0];
}

/**
 * First next_delivery_at for a new subscription — next occurrence of any
 * selected weekday at the chosen IST time. Both tracks now carry an explicit
 * daysOfWeek selection (daily = user-chosen subset of days, weekly = exactly
 * one day), so they share the same scheduling math; only a legacy
 * subscription with no daysOfWeek at all falls back to pure "every day".
 */
export function computeNextDeliveryAt(
  track: DeliveryTrack,
  daysOfWeek: number[] | null,
  timeOfDayUtc?: string
): string {
  const today = getCurrentISTDate();
  const istTime = utcToISTTime(timeOfDayUtc);
  const nowTime = getCurrentISTTime();

  if (!daysOfWeek?.length) {
    const targetDate = istTime > nowTime ? today : addDaysToISTDate(today, 1);
    return istToUTCDateTime(targetDate, istTime);
  }

  const daysToAdd = daysUntilNextWeeklyDay(today, daysOfWeek, istTime, nowTime);
  const targetDate = addDaysToISTDate(today, daysToAdd);
  return istToUTCDateTime(targetDate, istTime);
}

/** Advance next_delivery_at by one cycle (next selected weekday; legacy fallback: +1 day). */
export function advanceNextDeliveryAt(
  previousIso: string,
  track: DeliveryTrack,
  daysOfWeek?: number[] | null,
  timeOfDayUtc?: string
): string {
  const prevDate = utcToISTDate(previousIso) || getCurrentISTDate();
  const istTime = utcToISTTime(timeOfDayUtc) || utcToISTDateTime(previousIso).time;

  if (!daysOfWeek?.length) {
    return istToUTCDateTime(addDaysToISTDate(prevDate, 1), istTime);
  }

  const daysToAdd = daysUntilNextWeeklyDayAfter(prevDate, daysOfWeek);
  return istToUTCDateTime(addDaysToISTDate(prevDate, daysToAdd), istTime);
}

/** Shape a batch of drafts into `actions` insert rows. */
export function draftsToActionRows(drafts: DraftAction[], companyId: string, userId: string, cohortId: string) {
  return drafts.map((d) => ({
    company_id: companyId,
    created_by: userId,
    cohort_id: cohortId,
    is_personal: true,
    theme: d.theme,
    title: d.title,
    how: d.how,
    why: d.why,
    time_estimate: d.timeEstimate,
    is_system_action: false,
  }));
}

export type PersonalActionSubscriptionRow = {
  id: string;
  user_id: string;
  cohort_id: string;
  training_text: string;
  focus_themes: ActionTheme[];
  track: DeliveryTrack;
  day_of_week: number | null;
  days_of_week: number[] | null;
  daily_action_count: number;
  time_of_day_utc: string;
  next_delivery_at: string;
  last_delivered_at?: string | null;
};

/** Fetch all active subscriptions due at or before `nowIso`. */
export async function getDueSubscriptions(nowIso: string): Promise<PersonalActionSubscriptionRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("personal_action_subscriptions")
    .select("id, user_id, cohort_id, training_text, focus_themes, track, day_of_week, days_of_week, daily_action_count, time_of_day_utc, next_delivery_at, last_delivered_at")
    .eq("is_active", true)
    .is("archived_at", null)
    .not("cohort_id", "is", null)
    .lte("next_delivery_at", nowIso);
  return (data ?? []) as PersonalActionSubscriptionRow[];
}

/**
 * Keep up to `daily_action_count` generated personal actions active (ones
 * with no existing user_actions row yet, oldest first) into the user's
 * "My Actions" for this delivery cycle. Unlike the old deliverNewBatch, this
 * never generates new actions itself — the whole plan is generated upfront in
 * the background (see app/api/generate-actions-batch/route.ts); this just
 * paces how many of those already-generated actions are active at once, so
 * completing one doesn't pull in a replacement until the next delivery.
 * Only advances next_delivery_at when something was actually assigned, so a
 * pool that's temporarily empty (background generation still catching up)
 * retries next cycle instead of silently skipping ahead.
 */
export async function assignScheduledBatch(
  sub: Pick<PersonalActionSubscriptionRow, "id" | "user_id" | "cohort_id" | "track" | "day_of_week" | "days_of_week" | "daily_action_count" | "time_of_day_utc" | "next_delivery_at">
): Promise<{ assigned: number }> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const batchSize = sub.daily_action_count ?? DEFAULT_BATCH_SIZE;

  const [{ data: candidateActions }, { data: existingUA }] = await Promise.all([
    admin
      .from("actions")
      .select("id")
      .eq("created_by", sub.user_id)
      .eq("is_personal", true)
      .eq("cohort_id", sub.cohort_id)
      .order("created_at", { ascending: true }),
    admin
      .from("user_actions")
      .select("action_id, status")
      .eq("user_id", sub.user_id)
      .eq("cohort_id", sub.cohort_id),
  ]);

  const assignedIds = new Set((existingUA ?? []).map((r) => r.action_id));
  const activeCount = (existingUA ?? []).filter((row) => row.status === "scheduled").length;
  const slotsAvailable = Math.max(0, batchSize - activeCount);
  const unassigned = (candidateActions ?? []).filter((a) => !assignedIds.has(a.id));
  const batch = unassigned.slice(0, slotsAvailable);

  // An unfinished batch remains current; do not stack another full batch on
  // top of it. Advance the cadence and keep all remaining actions in backlog.
  if (slotsAvailable === 0) {
    await admin
      .from("personal_action_subscriptions")
      .update({
        next_delivery_at: advanceNextDeliveryAt(
          sub.next_delivery_at,
          sub.track,
          sub.days_of_week ?? (sub.day_of_week != null ? [sub.day_of_week] : null),
          sub.time_of_day_utc
        ),
        updated_at: nowIso,
      })
      .eq("id", sub.id);
    return { assigned: 0 };
  }

  if (batch.length) {
    const rows = batch.map((a) => ({
      user_id: sub.user_id,
      action_id: a.id,
      cohort_id: sub.cohort_id,
      status: "scheduled",
      scheduled_at: nowIso,
    }));
    await admin.from("user_actions").insert(rows);

    await admin
      .from("personal_action_subscriptions")
      .update({
        last_delivered_at: nowIso,
        next_delivery_at: advanceNextDeliveryAt(
          sub.next_delivery_at,
          sub.track,
          sub.days_of_week ?? (sub.day_of_week != null ? [sub.day_of_week] : null),
          sub.time_of_day_utc
        ),
        updated_at: nowIso,
      })
      .eq("id", sub.id);
  }

  return { assigned: batch.length };
}
