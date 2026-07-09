"use server";

import { Type } from "@google/genai";
import { createClient } from "@/lib/supabase/server";
import { getGeminiClient, isGeminiConfigured, GEMINI_MODEL } from "@/lib/gemini";
import { ACTION_DECK } from "@/lib/constants";
import type { ActionTheme } from "@/lib/types";
import { scheduleAction } from "@/app/actions/user-actions";
import { createActionReminder } from "@/app/actions/action-reminders";

export type DraftAction = {
  theme: ActionTheme;
  title: string;
  how: string;
  why: string;
  timeEstimate: string;
};

const THEMES: ActionTheme[] = ["Collaboration", "Feedback", "Accountability", "Connection", "Coaching"];

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

function buildPrompt(trainingText: string, focusThemes: ActionTheme[]): string {
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

A user just completed training and answered:
- What training did you do: "${trainingText.trim() || "(not specified)"}"
- Focus areas they want to work on: ${focusThemes.length ? focusThemes.join(", ") : "(no preference)"}

Here are examples of the format and tone we use for micro-actions:

${exampleBlock}

Generate 4 NEW micro-actions tailored to this user's training and focus areas. Each action must:
- Have a "title" that is a concrete, specific behavior (not vague advice).
- Have a "how" that is a literal, tactical script or step the user can do today.
- Have a "why" that is a single sentence of behavioral-science rationale.
- Have a "timeEstimate" like "2 mins", "5 mins", "15 mins", or "30 mins".
- Have a "theme" that is exactly one of: ${THEMES.join(", ")}.
Prefer themes from the user's stated focus areas when possible.`;
}

/** Generate draft personal actions from the user's training answers. Does not persist anything. */
export async function generatePersonalActions(params: {
  trainingText: string;
  focusThemes: ActionTheme[];
}): Promise<{ drafts?: DraftAction[]; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { error: "Not authenticated" };
    }

    if (!isGeminiConfigured()) {
      return { error: "AI generation is not configured (GEMINI_API_KEY missing)" };
    }

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: buildPrompt(params.trainingText, params.focusThemes),
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

/**
 * Persist accepted/edited drafts as personal actions, schedule each one, and set up its
 * weekly reminder. Marks the user's self-serve onboarding as complete.
 */
export async function saveGeneratedActions(
  drafts: (DraftAction & {
    day: string;
    time: string;
    timesPerWeek: number;
  })[]
): Promise<{ error?: string; savedCount?: number }> {
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

    let savedCount = 0;
    for (const draft of drafts) {
      const { data: actionRow, error: insertError } = await supabase
        .from("actions")
        .insert({
          company_id: companyId,
          created_by: user.id,
          is_personal: true,
          theme: draft.theme,
          title: draft.title.trim(),
          how: draft.how.trim(),
          why: draft.why.trim(),
          time_estimate: draft.timeEstimate || "5 mins",
          is_system_action: false,
        })
        .select("id")
        .single();

      if (insertError || !actionRow) {
        return { error: insertError?.message ?? "Failed to save action" };
      }

      const scheduleResult = await scheduleAction({
        actionId: actionRow.id,
        day: draft.day,
        time: draft.time,
        sync: false,
      });
      if (scheduleResult.error) {
        return { error: scheduleResult.error };
      }

      const { data: ua } = await supabase
        .from("user_actions")
        .select("id")
        .eq("user_id", user.id)
        .eq("action_id", actionRow.id)
        .single();

      if (ua) {
        const reminderResult = await createActionReminder({
          userActionId: ua.id,
          actionId: actionRow.id,
          timesPerWeek: draft.timesPerWeek,
          timeOfDayIST: draft.time,
        });
        if (reminderResult.error) {
          return { error: reminderResult.error };
        }
      }

      savedCount += 1;
    }

    await supabase
      .from("profiles")
      .update({ self_onboarding_completed_at: new Date().toISOString() })
      .eq("id", user.id);

    return { savedCount };
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
