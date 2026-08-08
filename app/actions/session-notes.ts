"use server";

import { createClient } from "@/lib/supabase/server";
import { getMyCohort } from "@/app/actions/cohorts";
import { Type } from "@google/genai";
import { getGeminiClient, isGeminiConfigured, GEMINI_MODEL } from "@/lib/gemini";
import {
  buildUserNotesPayload,
  parseStoredMyPlanAnswers,
  type MyPlanAnswers,
} from "@/lib/my-plan-notes";

export async function getMySessionNotes(cohortId?: string | null): Promise<{
  body: string;
  answers?: MyPlanAnswers;
  updatedAt?: string;
  error?: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { body: "", error: "Not authenticated" };
  const { cohort, error: cohortError } = await getMyCohort();
  if (cohortError) return { body: "", error: cohortError };
  if ((cohort?.id ?? null) !== (cohortId ?? null)) return { body: "", error: "Select this cohort before viewing its notes" };

  let query = supabase
    .from("participant_session_notes")
    .select("body, participant_name, designation, team, daily_work, skill_goal, practice_opportunities, updated_at")
    .eq("user_id", user.id);
  query = cohortId ? query.eq("cohort_id", cohortId) : query.is("cohort_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) return { body: "", error: error.message };
  const answers = parseStoredMyPlanAnswers(data?.body, data ? {
    name: data.participant_name,
    designation: data.designation,
    team: data.team,
    dailyWork: data.daily_work,
    skillGoal: data.skill_goal,
    practiceOpportunities: data.practice_opportunities,
  } : undefined);
  return { body: buildUserNotesPayload(answers), answers, updatedAt: data?.updated_at };
}

export async function saveMySessionNotes(
  input: string | MyPlanAnswers,
  cohortId?: string | null,
): Promise<{ updatedAt?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const answers = typeof input === "string"
    ? parseStoredMyPlanAnswers(input)
    : parseStoredMyPlanAnswers(null, input);
  const body = buildUserNotesPayload(answers);
  if (body.length > 50000) return { error: "Notes must be shorter than 50,000 characters" };
  const { cohort, error: cohortError } = await getMyCohort();
  if (cohortError) return { error: cohortError };
  if ((cohort?.id ?? null) !== (cohortId ?? null)) return { error: "Select this cohort before editing its notes" };

  const { data, error } = await supabase
    .from("participant_session_notes")
    .upsert({
      user_id: user.id,
      cohort_id: cohortId ?? null,
      body,
      participant_name: answers.name,
      designation: answers.designation,
      team: answers.team,
      daily_work: answers.dailyWork,
      skill_goal: answers.skillGoal,
      practice_opportunities: answers.practiceOpportunities,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,cohort_id" })
    .select("updated_at")
    .single();
  if (error) return { error: error.message };
  return { updatedAt: data.updated_at };
}

/** Rewrite My Plan answers into clearer wording without inventing new goals. */
export async function refineMySessionNotes(
  input: string | MyPlanAnswers,
  cohortId?: string | null,
): Promise<{ body?: string; answers?: MyPlanAnswers; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const answers = typeof input === "string"
    ? parseStoredMyPlanAnswers(input)
    : parseStoredMyPlanAnswers(null, input);
  const body = buildUserNotesPayload(answers);
  if (!body.trim()) return { error: "Add some answers before refining with AI" };
  if (body.length > 50000) return { error: "Notes must be shorter than 50,000 characters" };

  const { cohort, error: cohortError } = await getMyCohort();
  if (cohortError) return { error: cohortError };
  if ((cohort?.id ?? null) !== (cohortId ?? null)) return { error: "Select this cohort before editing its notes" };
  if (!isGeminiConfigured()) return { error: "AI refinement is not configured (GEMINI_API_KEY missing)" };

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `You help a learner tidy private plan answers that will later guide a workplace action plan.

Rewrite the answers below so they are clearer and more meaningful, while staying faithful to the writer's intent.

Rules:
- Keep the writer's meaning, priorities, and specific details.
- Do not invent new skills, goals, workplaces, teams, or commitments.
- Fix grammar and spelling lightly; keep a natural first-person voice.
- Keep name, designation, and team factual — only lightly clean them up if needed.
- Refine dailyWork, skillGoal, and practiceOpportunities into clearer short paragraphs.
- Return JSON only matching the schema. No markdown.

Answers:
"""
${body}
"""`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            designation: { type: Type.STRING },
            team: { type: Type.STRING },
            dailyWork: { type: Type.STRING },
            skillGoal: { type: Type.STRING },
            practiceOpportunities: { type: Type.STRING },
          },
          required: ["name", "designation", "team", "dailyWork", "skillGoal", "practiceOpportunities"],
        },
      },
    });

    const text = response.text?.trim();
    if (!text) return { error: "AI returned an empty response" };

    let parsed: Partial<MyPlanAnswers>;
    try {
      parsed = JSON.parse(text) as Partial<MyPlanAnswers>;
    } catch {
      return { error: "AI returned malformed output" };
    }

    const refined = parseStoredMyPlanAnswers(null, {
      name: parsed.name ?? answers.name,
      designation: parsed.designation ?? answers.designation,
      team: parsed.team ?? answers.team,
      dailyWork: parsed.dailyWork ?? answers.dailyWork,
      skillGoal: parsed.skillGoal ?? answers.skillGoal,
      practiceOpportunities: parsed.practiceOpportunities ?? answers.practiceOpportunities,
    });
    const refinedBody = buildUserNotesPayload(refined);
    if (!refinedBody.trim()) return { error: "AI returned an empty response" };
    if (refinedBody.length > 50000) return { error: "Refined answers are too long. Try shortening your draft first." };

    const saved = await saveMySessionNotes(refined, cohortId);
    if (saved.error) return { error: saved.error };
    return { body: refinedBody, answers: refined };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to refine notes" };
  }
}
