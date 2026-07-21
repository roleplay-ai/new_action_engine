"use server";

import { createClient } from "@/lib/supabase/server";

export async function getMySessionNotes(cohortId?: string | null): Promise<{ body: string; updatedAt?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { body: "", error: "Not authenticated" };

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

  const { data, error } = await supabase
    .from("participant_session_notes")
    .upsert({ user_id: user.id, cohort_id: cohortId ?? null, body, updated_at: new Date().toISOString() }, { onConflict: "user_id,cohort_id" })
    .select("updated_at")
    .single();
  if (error) return { error: error.message };
  return { updatedAt: data.updated_at };
}
