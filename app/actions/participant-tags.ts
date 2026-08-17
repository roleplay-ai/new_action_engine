"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ParticipantTag } from "@/lib/types";

const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || "admin@actionengine").toLowerCase();

/** Superadmin (or superadmin email), company admin, or any trainer — the roles
 * allowed to author new tags in the global participant_tags roster. */
async function ensureTagAuthor(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; userId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const isSuperadminEmail = user.email?.toLowerCase() === SUPERADMIN_EMAIL;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (
    profile?.role === "superadmin" ||
    isSuperadminEmail ||
    profile?.role === "admin" ||
    profile?.role === "trainer"
  ) {
    return { supabase, userId: user.id };
  }
  throw new Error("Forbidden: admin, superadmin or trainer only");
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
    revalidatePath("/admin/members");
    revalidatePath("/superadmin");
    revalidatePath("/trainer/members");
    return { id: data.id, tag: mapTagRow(data) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Remove a tag from the global roster entirely (not just one member's
 * assignment). Superadmin, company admin, or any trainer — same authorship
 * set allowed to create tags (see ensureTagAuthor). */
export async function deleteParticipantTag(id: string): Promise<{ error?: string }> {
  try {
    const { supabase } = await ensureTagAuthor();
    const { error } = await supabase.from("participant_tags").delete().eq("id", id);
    if (error) return { error: error.message };

    revalidatePath("/admin");
    revalidatePath("/admin/members");
    revalidatePath("/superadmin");
    revalidatePath("/journey");
    revalidatePath("/trainer/members");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Assign (or clear, with tagId null) a participant's tag for one specific
 * cohort membership. Superadmin, company admin of that cohort, or the
 * cohort's own trainer. */
export async function assignMemberTag(cohortId: string, userId: string, tagId: string | null): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: profile } = await supabase.from("profiles").select("role, company_id").eq("id", user.id).single();
    if (profile?.role !== "superadmin" && profile?.role !== "admin" && profile?.role !== "trainer") {
      throw new Error("Forbidden: admin, superadmin or trainer only");
    }

    if (profile?.role === "admin") {
      const { data: cohort } = await supabase.from("cohorts").select("company_id").eq("id", cohortId).maybeSingle();
      if (!cohort || cohort.company_id !== profile.company_id) {
        return { error: "You do not have access to this batch" };
      }
    }

    const { error } = await supabase
      .from("cohort_members")
      .update({ tag_id: tagId })
      .eq("cohort_id", cohortId)
      .eq("user_id", userId);
    if (error) return { error: error.message };

    revalidatePath("/admin");
    revalidatePath("/admin/members");
    revalidatePath("/journey");
    revalidatePath("/trainer/members");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}
