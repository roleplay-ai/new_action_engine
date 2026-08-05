"use server";

import { createClient } from "@/lib/supabase/server";
import { getMyCohort } from "@/app/actions/cohorts";
import { getGeminiClient, isGeminiConfigured, GEMINI_MODEL } from "@/lib/gemini";

export async function getMySessionNotes(cohortId?: string | null): Promise<{ body: string; updatedAt?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { body: "", error: "Not authenticated" };
  const { cohort, error: cohortError } = await getMyCohort();
  if (cohortError) return { body: "", error: cohortError };
  if ((cohort?.id ?? null) !== (cohortId ?? null)) return { body: "", error: "Select this cohort before viewing its notes" };

  let query = supabase
    .from("participant_session_notes")
    .select("body, updated_at")
    .eq("user_id", user.id);
  query = cohortId ? query.eq("cohort_id", cohortId) : query.is("cohort_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) return { body: "", error: error.message };
  return { body: data?.body ?? "", updatedAt: data?.updated_at };
}

export async function saveMySessionNotes(body: string, cohortId?: string | null): Promise<{ updatedAt?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (body.length > 50000) return { error: "Notes must be shorter than 50,000 characters" };
  const { cohort, error: cohortError } = await getMyCohort();
  if (cohortError) return { error: cohortError };
  if ((cohort?.id ?? null) !== (cohortId ?? null)) return { error: "Select this cohort before editing its notes" };

  const { data, error } = await supabase
    .from("participant_session_notes")
    .upsert({ user_id: user.id, cohort_id: cohortId ?? null, body, updated_at: new Date().toISOString() }, { onConflict: "user_id,cohort_id" })
    .select("updated_at")
    .single();
  if (error) return { error: error.message };
  return { updatedAt: data.updated_at };
}

/** Rewrite session notes into a clearer, well-structured draft without inventing new goals. */
export async function refineMySessionNotes(
  body: string,
  cohortId?: string | null,
): Promise<{ body?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const trimmed = body.trim();
  if (!trimmed) return { error: "Add some notes before refining with AI" };
  if (trimmed.length > 50000) return { error: "Notes must be shorter than 50,000 characters" };
  const { cohort, error: cohortError } = await getMyCohort();
  if (cohortError) return { error: cohortError };
  if ((cohort?.id ?? null) !== (cohortId ?? null)) return { error: "Select this cohort before editing its notes" };
  if (!isGeminiConfigured()) return { error: "AI refinement is not configured (GEMINI_API_KEY missing)" };

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `You help a learner tidy private session notes that will later guide a workplace action plan.

Rewrite the notes below so they are clearer and more meaningful, while staying faithful to the writer's intent.

Rules:
- Keep the writer's meaning, priorities, and specific details.
- Do not invent new skills, goals, workplaces, or commitments.
- Organise into short sections when helpful (for example: Skills I want to build, Why this matters, Where I will apply this).
- Fix grammar and spelling lightly; keep a natural first-person voice.
- Use plain text only: short headings and paragraphs, no markdown bullets or code fences.
- Return only the rewritten notes, nothing else.

Notes:
"""
${trimmed}
"""`,
    });

    const refined = response.text?.trim();
    if (!refined) return { error: "AI returned an empty response" };
    if (refined.length > 50000) return { error: "Refined notes are too long. Try shortening your draft first." };

    const saved = await saveMySessionNotes(refined, cohortId);
    if (saved.error) return { error: saved.error };
    return { body: refined };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to refine notes" };
  }
}
