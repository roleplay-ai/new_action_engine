import { Type } from "@google/genai";
import { getGeminiClient, isGeminiConfigured, GEMINI_MODEL } from "@/lib/gemini";
import type { ActionTheme } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { IST_OFFSET_MINUTES, getCurrentISTDate, utcToISTDate, utcToISTTime, utcToISTDateTime, istToUTCDateTime } from "@/lib/timezone-utils";

export type DraftAction = {
  theme: ActionTheme;
  title: string;
  how: string;
  why: string;
  timeEstimate: string;
};

export const THEMES: ActionTheme[] = ["Collaboration", "Feedback", "Accountability", "Connection", "Coaching"];
/** DB still requires action_theme; store a fixed default and never surface it in UI. */
export const DEFAULT_ACTION_THEME: ActionTheme = "Collaboration";

/** Default batch size for the interactive onboarding preview (before a plan duration is chosen). */
export const DEFAULT_BATCH_SIZE = 3;
/** @deprecated Use daily_action_count from subscription; kept for generation preview batches. */
export const BATCH_SIZE = DEFAULT_BATCH_SIZE;
/** Actions generated per call when background-filling a full multi-week plan. */
export const BACKGROUND_BATCH_SIZE = 12;
/** IST weekdays used by daily plans: Monday through Friday. */
export const DAILY_DELIVERY_DAYS = [1, 2, 3, 4, 5] as const;

const draftSchema = {
  type: Type.OBJECT,
  properties: {
    actions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          how: { type: Type.STRING },
          why: { type: Type.STRING },
          timeEstimate: { type: Type.STRING },
        },
        required: ["title", "how", "why", "timeEstimate"],
      },
    },
  },
  required: ["actions"],
};

/** Weekly: duration x actions/week. Daily: duration x actions/day x 5 weekdays. */
export function computeTotalActionsNeeded(
  durationWeeks: number,
  dailyActionCount: number,
  track: DeliveryTrack,
  daysOfWeek?: number[] | null
): number {
  const activeDaysPerWeek = track === "daily" ? DAILY_DELIVERY_DAYS.length : 1;
  return durationWeeks * dailyActionCount * activeDaysPerWeek;
}

export function buildTrainingContext(
  userNotes: string,
  focusThemes: ActionTheme[],
  focusCustomText?: string
): string {
  const parts: string[] = [];
  const base = userNotes.trim();
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
  trainingContent: string,
  userNotes: string,
  businessContext: string,
  focusThemes: ActionTheme[],
  count: number,
  avoidTitles?: string[]
): string {
  const avoidBlock = avoidTitles?.length
    ? `\n\nACTIONS TO AVOID\nDo not repeat these actions or close variants:\n${avoidTitles.map((t) => `- ${t}`).join("\n")}`
    : "";

  const focusNote = focusThemes.length
    ? focusThemes.join(", ")
    : "No additional focus areas selected.";

  return `You write personal development actions for leadership-program participants in the Nudgeable nudge style. Match the tone, structure, and level of detail in these examples.

EXAMPLE 1
What: Name the emotion in the room before addressing the issue.
How: In your next tense meeting or one-on-one, before jumping to the solution, say what you notice out loud. Something like: "I sense there's some frustration here, let's talk about that first." Wait for the response before moving to the fix.
Why: People solve problems better once they feel heard, not managed.

EXAMPLE 2
What: Get one number explained to you by someone outside your function.
How: Pick one metric you see often but don't fully understand, margin, utilization, churn, whatever applies to your work. Ask a colleague in a different function to explain it to you in plain terms over a quick chat.
Why: Understanding the numbers behind the business helps you make faster, better-argued decisions.

INPUTS
TRAINING_CONTENT:
${trainingContent.trim()}

USER_NOTES:
${userNotes.trim() || "The participant did not provide detailed notes."}

USER_NOTES is structured JSON containing only participant-entered answer values and neutral field names. Treat empty values as absent. Do not infer that any UI question, helper hint, placeholder, or instructional copy was written by the participant.

ADDITIONAL_FOCUS_AREAS:
${focusNote}

BUSINESS_CONTEXT:
${businessContext.trim()}

TASK
Generate exactly ${count} new actions. Every action must combine all three core inputs: the skill taught in TRAINING_CONTENT, the participant's specific goal, struggle, or reflection in USER_NOTES, and a situation that is realistic in BUSINESS_CONTEXT. Do not create generic actions based only on the training topic. If USER_NOTES is vague, use the closest reasonable interpretation without inventing personal facts.

FORMAT AND QUALITY RULES
- "title" is the What: one short, specific, observable action statement that starts with a strong verb.
- "how" is the How: 3 to 6 short sentences in simple English, written in "you" voice. Give a clear situation, sequence, or trigger so a busy manager can act without asking a follow-up question. A natural example phrase in quotes is welcome when useful.
- "why" is the Why: exactly one sentence. Start with the benefit, not the action. Do not use corporate jargon such as leverage, synergy, align, or touch base.
- "timeEstimate" is a realistic value such as "2 mins", "5 mins", "15 mins", or "30 mins".
- Keep the actions practical, distinct from one another, and realistic during normal work.
- Do not add theme labels, category tags, bullets inside fields, or commentary outside the required JSON.${avoidBlock}

Before returning the result, silently check that every action clearly reflects TRAINING_CONTENT, USER_NOTES, and BUSINESS_CONTEXT, and that every Why is exactly one sentence.`;
}

/** Calls Gemini to draft `count` new personal actions. Does not persist anything. */
export async function generateDraftActions(params: {
  trainingContent: string;
  userNotes: string;
  businessContext: string;
  focusThemes: ActionTheme[];
  count?: number;
  avoidTitles?: string[];
}): Promise<{ drafts?: DraftAction[]; error?: string }> {
  try {
    if (!isGeminiConfigured()) {
      return { error: "AI generation is not configured (GEMINI_API_KEY missing)" };
    }
    if (!params.trainingContent.trim() || !params.businessContext.trim()) {
      return { error: "This cohort needs training content and business context before actions can be generated" };
    }

    const count = params.count ?? DEFAULT_BATCH_SIZE;
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: buildPrompt(
        params.trainingContent,
        params.userNotes,
        params.businessContext,
        params.focusThemes,
        count,
        params.avoidTitles
      ),
      config: {
        responseMimeType: "application/json",
        responseSchema: draftSchema,
      },
    });

    const text = response.text;
    if (!text) {
      return { error: "AI returned an empty response" };
    }

    let parsed: { actions?: Array<{ title?: string; how?: string; why?: string; timeEstimate?: string }> };
    try {
      parsed = JSON.parse(text);
    } catch {
      return { error: "AI returned malformed output" };
    }

    const drafts = (parsed.actions ?? []).filter(
      (a) => a && a.title && a.how && a.why
    );
    if (!drafts.length) {
      return { error: "AI did not return any actions" };
    }

    return {
      drafts: drafts.map((a) => ({
        theme: DEFAULT_ACTION_THEME,
        title: a.title!.trim(),
        how: a.how!.trim(),
        why: a.why!.trim(),
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
export function getWeekdayIST(dateStr: string): number {
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

/**
 * First next_delivery_at for a new subscription. A plan always begins on a
 * future calendar day: daily starts on the next weekday, while weekly starts
 * on the next occurrence of its selected weekday (the following week when
 * today is that weekday).
 */
export function computeNextDeliveryAt(
  track: DeliveryTrack,
  daysOfWeek: number[] | null,
  timeOfDayUtc?: string
): string {
  const today = getCurrentISTDate();
  const istTime = utcToISTTime(timeOfDayUtc);
  const cadenceDays = track === "daily" ? [...DAILY_DELIVERY_DAYS] : daysOfWeek;
  const daysToAdd = cadenceDays?.length
    ? daysUntilNextWeeklyDayAfter(today, cadenceDays)
    : 1;
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

  const cadenceDays = track === "daily" ? [...DAILY_DELIVERY_DAYS] : daysOfWeek;

  if (!cadenceDays?.length) {
    return istToUTCDateTime(addDaysToISTDate(prevDate, 1), istTime);
  }

  const daysToAdd = daysUntilNextWeeklyDayAfter(prevDate, cadenceDays);
  return istToUTCDateTime(addDaysToISTDate(prevDate, daysToAdd), istTime);
}

/** Shape a batch of drafts into `actions` insert rows. */
export function draftsToActionRows(
  drafts: DraftAction[],
  companyId: string,
  userId: string,
  cohortId: string,
  startPlanOrder = 0
) {
  return drafts.map((d, index) => ({
    company_id: companyId,
    created_by: userId,
    cohort_id: cohortId,
    plan_order: startPlanOrder + index,
    is_personal: true,
    theme: DEFAULT_ACTION_THEME,
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
 * Move up to `daily_action_count` generated personal actions into the user's
 * "My Actions" for this delivery cycle, using the participant's chosen plan
 * order and considering only actions without a user_actions row. Unlike the
 * old deliverNewBatch, this
 * never generates new actions itself — the whole plan is generated upfront in
 * the background (see app/api/generate-actions-batch/route.ts); this just
 * paces how many of those already-generated actions are active at once, so
 * completing one doesn't pull in a replacement until the next delivery.
 * Only advances next_delivery_at when something was actually assigned, so a
 * pool that's temporarily empty (background generation still catching up)
 * retries next cycle instead of silently skipping ahead.
 */
export async function assignScheduledBatch(
  sub: Pick<PersonalActionSubscriptionRow, "id" | "user_id" | "cohort_id" | "track" | "day_of_week" | "days_of_week" | "daily_action_count" | "time_of_day_utc" | "next_delivery_at">,
  options?: { advanceCadence?: boolean }
): Promise<{ assigned: number }> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  // Daily practice is intentionally one action per weekday. Normalise older
  // subscriptions here as well as at plan creation so they cannot release a
  // stacked daily batch.
  const batchSize = sub.track === "daily" ? 1 : sub.daily_action_count ?? DEFAULT_BATCH_SIZE;

  // Older daily subscriptions can still contain the previous seven-day
  // cadence. Never release an action batch on Saturday or Sunday.
  if (
    sub.track === "daily"
    && !DAILY_DELIVERY_DAYS.includes(
      getWeekdayIST(getCurrentISTDate()) as (typeof DAILY_DELIVERY_DAYS)[number]
    )
  ) {
    await admin
      .from("personal_action_subscriptions")
      .update({
        next_delivery_at: computeNextDeliveryAt(
          "daily",
          [...DAILY_DELIVERY_DAYS],
          sub.time_of_day_utc
        ),
        updated_at: nowIso,
      })
      .eq("id", sub.id);
    return { assigned: 0 };
  }

  const [{ data: candidateActions }, { data: existingUA }] = await Promise.all([
    admin
      .from("actions")
      .select("id")
      .eq("created_by", sub.user_id)
      .eq("is_personal", true)
      .eq("cohort_id", sub.cohort_id)
      .order("plan_order", { ascending: true, nullsFirst: false })
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
        next_delivery_at: options?.advanceCadence === false
          ? sub.next_delivery_at
          : advanceNextDeliveryAt(
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
        next_delivery_at: options?.advanceCadence === false
          ? sub.next_delivery_at
          : advanceNextDeliveryAt(
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
