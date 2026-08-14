"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ParticipantTag } from "@/lib/types";

const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || "admin@actionengine").toLowerCase();

/** Superadmin (or superadmin email) or any trainer — the roles allowed to
 * author new tags in the global participant_tags roster. */
async function ensureTagAuthor(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; userId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const isSuperadminEmail = user.email?.toLowerCase() === SUPERADMIN_EMAIL;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role === "superadmin" || isSuperadminEmail || profile?.role === "trainer") {
    return { supabase, userId: user.id };
  }
  throw new Error("Forbidden: superadmin or trainer only");
}

function mapTagRow(row: { id: string; name: string }): ParticipantTag {
  return { id: row.id, name: row.name };
}

/** The full tag roster, for the cohort management members tab. Readable by
 * any authenticated user (harmless label text), mirroring listTrainers. */
export async function listParticipantTags(): Promise<{ error?: string; tags?: ParticipantTag[] }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data, error } = await supabase.from("participant_tags").select("id, name").order("name");
    if (error) return { error: error.message };
    return { tags: (data ?? []).map(mapTagRow) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function createParticipantTag(name: string): Promise<{ error?: string; id?: string; tag?: ParticipantTag }> {
  try {
    const { supabase, userId } = await ensureTagAuthor();
    const trimmed = name.trim();
    if (!trimmed) return { error: "Tag name is required" };

    const { data, error } = await supabase
      .from("participant_tags")
      .insert({ name: trimmed, created_by: userId })
      .select("id, name")
      .single();
    if (error) {
      if (error.code === "23505") return { error: "A tag with this name already exists" };
      return { error: error.message };
    }

    revalidatePath("/admin");
    revalidatePath("/superadmin");
    revalidatePath("/trainer/members");
    return { id: data.id, tag: mapTagRow(data) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Remove a tag from the global roster entirely (not just one member's
 * assignment). Superadmin, or any trainer — same authorship pair allowed to
 * create tags (see ensureTagAuthor), so a trainer can clean up tags they no
 * longer need from their Members & tags page. */
export async function deleteParticipantTag(id: string): Promise<{ error?: string }> {
  try {
    const { supabase } = await ensureTagAuthor();
    const { error } = await supabase.from("participant_tags").delete().eq("id", id);
    if (error) return { error: error.message };

    revalidatePath("/admin");
    revalidatePath("/superadmin");
    revalidatePath("/journey");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Assign (or clear, with tagId null) a participant's tag for one specific
 * cohort membership. Superadmin, or the cohort's own trainer (matches the
 * "Trainer update cohort_members" RLS policy). */
export async function assignMemberTag(cohortId: string, userId: string, tagId: string | null): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "superadmin" && profile?.role !== "trainer") {
      throw new Error("Forbidden: superadmin or trainer only");
    }

    const { error } = await supabase
      .from("cohort_members")
      .update({ tag_id: tagId })
      .eq("cohort_id", cohortId)
      .eq("user_id", userId);
    if (error) return { error: error.message };

    revalidatePath("/admin");
    revalidatePath("/journey");
    revalidatePath("/trainer/members");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}
