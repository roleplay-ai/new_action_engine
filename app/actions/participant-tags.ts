"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ParticipantTag } from "@/lib/types";

const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || "admin@actionengine").toLowerCase();

async function ensureSuperadmin(): Promise<{ userId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const isSuperadminEmail = user.email?.toLowerCase() === SUPERADMIN_EMAIL;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "superadmin" && !isSuperadminEmail) {
    throw new Error("Forbidden: superadmin only");
  }
  return { userId: user.id };
}

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

/** Tags actually assigned to at least one participant somewhere within the
 * given company — used wherever a company admin (or anyone assigning a tag
 * within one company's roster) picks from existing tags, instead of the
 * full global tag list, which would otherwise mix in every other company's
 * team names too. Superadmin still gets the full roster via
 * listParticipantTags on the dedicated tag management page. */
export async function listParticipantTagsForCompany(companyId: string): Promise<{ error?: string; tags?: ParticipantTag[] }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const isSuperadminEmail = user.email?.toLowerCase() === SUPERADMIN_EMAIL;
    const { data: profile } = await supabase.from("profiles").select("role, company_id").eq("id", user.id).single();
    const isSuperadmin = profile?.role === "superadmin" || isSuperadminEmail;
    if (!isSuperadmin && !(profile?.role === "admin" && profile.company_id === companyId)) {
      return { error: "Access denied" };
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("cohort_members")
      .select("participant_tags(id, name), cohorts!inner(company_id)")
      .eq("cohorts.company_id", companyId)
      .not("tag_id", "is", null);
    if (error) return { error: error.message };

    const seen = new Map<string, ParticipantTag>();
    for (const row of (data ?? []) as { participant_tags: { id: string; name: string } | { id: string; name: string }[] | null }[]) {
      const tag = Array.isArray(row.participant_tags) ? row.participant_tags[0] : row.participant_tags;
      if (tag) seen.set(tag.id, mapTagRow(tag));
    }
    return { tags: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Every tag with how many participants (and distinct companies) currently
 * carry it — the superadmin tag management screen's own list, so renaming or
 * deleting a widely-reused tag isn't a guess. */
export type ParticipantTagUsage = ParticipantTag & { memberCount: number; companyCount: number };

export async function listParticipantTagsWithUsage(): Promise<{ error?: string; tags?: ParticipantTagUsage[] }> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const { data: tags, error: tagsError } = await admin.from("participant_tags").select("id, name").order("name");
    if (tagsError) return { error: tagsError.message };

    const { data: usageRows, error: usageError } = await admin
      .from("cohort_members")
      .select("tag_id, cohorts(company_id)")
      .not("tag_id", "is", null);
    if (usageError) return { error: usageError.message };

    const memberCounts = new Map<string, number>();
    const companySets = new Map<string, Set<string>>();
    for (const row of (usageRows ?? []) as { tag_id: string; cohorts: { company_id: string } | { company_id: string }[] | null }[]) {
      memberCounts.set(row.tag_id, (memberCounts.get(row.tag_id) ?? 0) + 1);
      const cohort = Array.isArray(row.cohorts) ? row.cohorts[0] : row.cohorts;
      const companyId = cohort?.company_id;
      if (companyId) {
        const set = companySets.get(row.tag_id) ?? new Set<string>();
        set.add(companyId);
        companySets.set(row.tag_id, set);
      }
    }

    return {
      tags: (tags ?? []).map((tag) => ({
        ...mapTagRow(tag),
        memberCount: memberCounts.get(tag.id) ?? 0,
        companyCount: companySets.get(tag.id)?.size ?? 0,
      })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Renames a tag everywhere it's used — superadmin only, since a shared tag
 * (e.g. "Team 1") can be assigned across many companies' batches at once. */
export async function renameParticipantTag(id: string, name: string): Promise<{ error?: string; tag?: ParticipantTag }> {
  try {
    await ensureSuperadmin();
    const supabase = await createClient();
    const trimmed = name.trim();
    if (!trimmed) return { error: "Tag name is required" };

    const { data, error } = await supabase
      .from("participant_tags")
      .update({ name: trimmed })
      .eq("id", id)
      .select("id, name")
      .single();
    if (error) {
      if (error.code === "23505") return { error: "A tag with this name already exists" };
      return { error: error.message };
    }

    revalidatePath("/admin");
    revalidatePath("/admin/members");
    revalidatePath("/superadmin");
    revalidatePath("/journey");
    revalidatePath("/trainer/members");
    return { tag: mapTagRow(data) };
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
