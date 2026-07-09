import { Type } from "@google/genai";
import { getGeminiClient, isGeminiConfigured, GEMINI_MODEL } from "@/lib/gemini";
import { ACTION_DECK } from "@/lib/constants";
import type { ActionTheme } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { IST_OFFSET_MINUTES, getCurrentISTDate } from "@/lib/timezone-utils";

export type DraftAction = {
  theme: ActionTheme;
  title: string;
  how: string;
  why: string;
  timeEstimate: string;
};

export const THEMES: ActionTheme[] = ["Collaboration", "Feedback", "Accountability", "Connection", "Coaching"];

/** Size of each generated batch — the initial onboarding batch and every recurring delivery. */
export const BATCH_SIZE = 3;

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

function buildPrompt(trainingText: string, focusThemes: ActionTheme[], count: number): string {
  const examples = ACTION_DECK.filter(
    (a) => focusThemes.length === 0 || focusThemes.includes(a.theme)
  ).slice(0, 4);
  const exampleBlock = (examples.length ? examples : ACTION_DECK.slice(0, 3))
    .map(
      (a) =>
        `- Theme: ${a.theme}\n  Title: ${a.title}\n  How: ${a.how}\n  Why: ${a.why}\n  Time: ${a.timeEstimate}`
    )
    .join("\n\n");

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
Prefer themes from the user's stated focus areas when possible. Do not repeat actions already suggested before.`;
}

/** Calls Gemini to draft `count` new personal actions. Does not persist anything. */
export async function generateDraftActions(params: {
  trainingText: string;
  focusThemes: ActionTheme[];
  count?: number;
}): Promise<{ drafts?: DraftAction[]; error?: string }> {
  try {
    if (!isGeminiConfigured()) {
      return { error: "AI generation is not configured (GEMINI_API_KEY missing)" };
    }

    const count = params.count ?? BATCH_SIZE;
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: buildPrompt(params.trainingText, params.focusThemes, count),
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

/** Midnight IST of a given YYYY-MM-DD, as a UTC ISO timestamp. */
function istMidnightAsUtcIso(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const istMidnightUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0) - IST_OFFSET_MINUTES * 60 * 1000;
  return new Date(istMidnightUtcMs).toISOString();
}

export type DeliveryTrack = "daily" | "weekly";

/**
 * First next_delivery_at for a new subscription.
 * - daily: tomorrow (IST midnight as UTC ISO) — the day after signup, so today's
 *   initial batch isn't immediately followed by another one on the same cron pass.
 * - weekly: next occurrence of `dayOfWeek` (0=Sun..6=Sat, IST) strictly after today.
 */
export function computeNextDeliveryAt(track: DeliveryTrack, dayOfWeek: number | null): string {
  const today = getCurrentISTDate();
  if (track === "daily") {
    return istMidnightAsUtcIso(addDaysToISTDate(today, 1));
  }
  const todayDow = getWeekdayIST(today);
  const target = dayOfWeek ?? todayDow;
  const daysToAdd = ((target - todayDow + 7) % 7) || 7; // always in the future, never today
  return istMidnightAsUtcIso(addDaysToISTDate(today, daysToAdd));
}

/** Advance a previous next_delivery_at by one cycle (1 day for daily, 7 days for weekly). */
export function advanceNextDeliveryAt(previousIso: string, track: DeliveryTrack): string {
  const d = new Date(previousIso);
  d.setUTCDate(d.getUTCDate() + (track === "daily" ? 1 : 7));
  return d.toISOString();
}

/** Shape a batch of drafts into `actions` insert rows. */
export function draftsToActionRows(drafts: DraftAction[], companyId: string, userId: string) {
  return drafts.map((d) => ({
    company_id: companyId,
    created_by: userId,
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
  training_text: string;
  focus_themes: ActionTheme[];
  track: DeliveryTrack;
  day_of_week: number | null;
  time_of_day_utc: string;
  next_delivery_at: string;
};

/** Fetch all active subscriptions due at or before `nowIso`. */
export async function getDueSubscriptions(nowIso: string): Promise<PersonalActionSubscriptionRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("personal_action_subscriptions")
    .select("id, user_id, training_text, focus_themes, track, day_of_week, time_of_day_utc, next_delivery_at")
    .eq("is_active", true)
    .lte("next_delivery_at", nowIso);
  return (data ?? []) as PersonalActionSubscriptionRow[];
}

/**
 * Generate a fresh batch of personal actions for a subscription and insert them
 * directly into the user's library (available in their carousel, not pre-accepted).
 * Pulls from the user's backlog (oldest first, from earlier "Generate more" clicks)
 * before topping up with freshly-generated ones via Gemini, so at most BATCH_SIZE
 * new actions land per delivery regardless of how many the user generated up front.
 * Advances the subscription's next_delivery_at on success (even on partial failure,
 * to avoid retry storms — the next cycle will try again).
 */
export async function deliverNewBatch(sub: PersonalActionSubscriptionRow): Promise<{ inserted: number; error?: string }> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: profile } = await admin
    .from("profiles")
    .select("company_id")
    .eq("id", sub.user_id)
    .single();
  const companyId = profile?.company_id;

  let inserted = 0;
  let error: string | undefined;

  if (companyId) {
    const { data: backlogRows } = await admin
      .from("personal_action_backlog")
      .select("id, theme, title, how, why, time_estimate")
      .eq("user_id", sub.user_id)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    const fromBacklog: DraftAction[] = (backlogRows ?? []).map((r) => ({
      theme: r.theme,
      title: r.title,
      how: r.how,
      why: r.why,
      timeEstimate: r.time_estimate,
    }));

    let drafts: DraftAction[] = fromBacklog;
    const shortfall = BATCH_SIZE - fromBacklog.length;
    if (shortfall > 0) {
      const { drafts: generated, error: genError } = await generateDraftActions({
        trainingText: sub.training_text,
        focusThemes: sub.focus_themes,
        count: shortfall,
      });
      if (generated) {
        drafts = [...drafts, ...generated];
      } else if (!fromBacklog.length) {
        error = genError ?? "No drafts generated";
      }
    }

    if (drafts.length) {
      const rows = draftsToActionRows(drafts, companyId, sub.user_id);
      const { error: insertError, count } = await admin.from("actions").insert(rows, { count: "exact" });
      if (insertError) {
        error = insertError.message;
      } else {
        inserted = count ?? rows.length;
        const backlogIds = (backlogRows ?? []).map((r) => r.id);
        if (backlogIds.length) {
          await admin.from("personal_action_backlog").delete().in("id", backlogIds);
        }
      }
    }
  } else {
    error = "User has no company";
  }

  await admin
    .from("personal_action_subscriptions")
    .update({
      last_delivered_at: nowIso,
      next_delivery_at: advanceNextDeliveryAt(sub.next_delivery_at, sub.track),
      updated_at: nowIso,
    })
    .eq("id", sub.id);

  return { inserted, error };
}
