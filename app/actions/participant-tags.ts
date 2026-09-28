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

/** One batch currently using a team, for the superadmin tag management
 * screen's per-tag breakdown. */
export type ParticipantTagBatchUsage = {
  cohortId: string;
  cohortName: string;
  companyId: string;
  companyName: string;
  memberCount: number;
  /** What this team is actually called in this one batch — the batch's own
   * cohort_team_names override if a superadmin set one, otherwise just the
   * tag's global name. */
  displayName: string;
  isRenamed: boolean;
};

/** Every tag with how many participants (and distinct companies/batches)
 * currently carry it — the superadmin tag management screen's own list, so
 * renaming or deleting a widely-reused tag isn't a guess. */
export type ParticipantTagUsage = ParticipantTag & {
  memberCount: number;
  companyCount: number;
  batches: ParticipantTagBatchUsage[];
};

export async function listParticipantTagsWithUsage(): Promise<{ error?: string; tags?: ParticipantTagUsage[] }> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const { data: tags, error: tagsError } = await admin.from("participant_tags").select("id, name").order("name");
    if (tagsError) return { error: tagsError.message };

    // Archiving a batch is this app's soft-delete (see archiveCohort in
    // app/actions/cohorts.ts) — its cohort_members rows, and any tag_id on
    // them, stick around in the DB. Excluding archived cohorts here (like
    // every other "current" listing does, e.g. listCohorts) keeps a team's
    // usage count from being inflated by batches that have since been
    // retired, which is what made this screen look like it showed stale data.
    const { data: usageRows, error: usageError } = await admin
      .from("cohort_members")
      .select("tag_id, cohorts!inner(id, name, company_id, archived_at)")
      .not("tag_id", "is", null)
      .is("cohorts.archived_at", null);
    if (usageError) return { error: usageError.message };

    type UsageRow = { tag_id: string; cohorts: { id: string; name: string; company_id: string } | { id: string; name: string; company_id: string }[] | null };
    const rows = (usageRows ?? []) as UsageRow[];

    const companyIds = new Set<string>();
    for (const row of rows) {
      const cohort = Array.isArray(row.cohorts) ? row.cohorts[0] : row.cohorts;
      if (cohort) companyIds.add(cohort.company_id);
    }
    const companyRows = companyIds.size
      ? await admin.from("companies").select("id, name").in("id", [...companyIds])
      : { data: [] as { id: string; name: string }[] };
    const companyNameById = new Map((companyRows.data ?? []).map((company) => [company.id, company.name]));

    // Per-batch display-name overrides (see cohort_team_names, migration 078)
    // — without these, a team renamed just for one batch (from that batch's
    // own Settings tab) would never show its renamed label here, only the
    // tag's global name, which is what made a rename look like it "didn't work".
    const cohortIds = [...new Set(rows.map((row) => (Array.isArray(row.cohorts) ? row.cohorts[0]?.id : row.cohorts?.id)).filter((id): id is string => !!id))];
    const teamNameRows = cohortIds.length
      ? await admin.from("cohort_team_names").select("cohort_id, tag_id, display_name").in("cohort_id", cohortIds)
      : { data: [] as { cohort_id: string; tag_id: string; display_name: string }[] };
    const overrideByCohortAndTag = new Map(
      (teamNameRows.data ?? []).map((row) => [`${row.cohort_id}:${row.tag_id}`, row.display_name])
    );

    const memberCounts = new Map<string, number>();
    const companySets = new Map<string, Set<string>>();
    const batchesByTag = new Map<string, Map<string, ParticipantTagBatchUsage & { overrideName?: string }>>();

    for (const row of rows) {
      const cohort = Array.isArray(row.cohorts) ? row.cohorts[0] : row.cohorts;
      if (!cohort) continue;

      memberCounts.set(row.tag_id, (memberCounts.get(row.tag_id) ?? 0) + 1);

      const companySet = companySets.get(row.tag_id) ?? new Set<string>();
      companySet.add(cohort.company_id);
      companySets.set(row.tag_id, companySet);

      const batchMap = batchesByTag.get(row.tag_id) ?? new Map<string, ParticipantTagBatchUsage & { overrideName?: string }>();
      const existing = batchMap.get(cohort.id);
      if (existing) {
        existing.memberCount += 1;
      } else {
        batchMap.set(cohort.id, {
          cohortId: cohort.id,
          cohortName: cohort.name,
          companyId: cohort.company_id,
          companyName: companyNameById.get(cohort.company_id) ?? "Unknown company",
          memberCount: 1,
          displayName: "",
          isRenamed: false,
          overrideName: overrideByCohortAndTag.get(`${cohort.id}:${row.tag_id}`),
        });
      }
      batchesByTag.set(row.tag_id, batchMap);
    }

    return {
      tags: (tags ?? []).map((tag) => ({
        ...mapTagRow(tag),
        memberCount: memberCounts.get(tag.id) ?? 0,
        companyCount: companySets.get(tag.id)?.size ?? 0,
        batches: [...(batchesByTag.get(tag.id)?.values() ?? [])]
          .map(({ overrideName, ...batch }) => ({
            ...batch,
            displayName: overrideName ?? tag.name,
            isRenamed: !!overrideName,
          }))
          .sort((a, b) => a.companyName.localeCompare(b.companyName) || a.cohortName.localeCompare(b.cohortName)),
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
    revalidatePath("/superadmin/tags");
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
    revalidatePath("/superadmin/tags");
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
    revalidatePath("/superadmin/tags");
    revalidatePath("/journey");
    revalidatePath("/trainer/members");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/** This batch's own display-name overrides for shared teams (participant_tags
 * rows) — see cohort_team_names (migration 078). Keyed by tag_id; a tag with
 * no entry here falls back to its global participant_tags.name for this
 * batch. Readable by the batch's own company admin or any superadmin. */
export async function getCohortTeamNameOverrides(cohortId: string): Promise<{ error?: string; overrides?: Record<string, string> }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const isSuperadminEmail = user.email?.toLowerCase() === SUPERADMIN_EMAIL;
    const { data: profile } = await supabase.from("profiles").select("role, company_id").eq("id", user.id).single();
    const isSuperadmin = profile?.role === "superadmin" || isSuperadminEmail;
    if (!isSuperadmin) {
      const { data: cohort } = await supabase.from("cohorts").select("company_id").eq("id", cohortId).maybeSingle();
      if (profile?.role !== "admin" || !cohort || cohort.company_id !== profile.company_id) {
        return { error: "Access denied" };
      }
    }

    const { data, error } = await supabase
      .from("cohort_team_names")
      .select("tag_id, display_name")
      .eq("cohort_id", cohortId);
    if (error) return { error: error.message };

    const overrides: Record<string, string> = {};
    for (const row of (data ?? []) as { tag_id: string; display_name: string }[]) {
      overrides[row.tag_id] = row.display_name;
    }
    return { overrides };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Set (or clear, with a blank or unchanged name) this batch's own
 * display-name override for a shared team. Superadmin only — the underlying
 * tag can be shared across other companies' batches, so a plain company admin
 * isn't allowed to change how it's labelled even just for their own batch. */
export async function setCohortTeamName(cohortId: string, tagId: string, displayName: string): Promise<{ error?: string }> {
  try {
    await ensureSuperadmin();
    const supabase = await createClient();

    const { data: tag, error: tagError } = await supabase.from("participant_tags").select("name").eq("id", tagId).single();
    if (tagError || !tag) return { error: "Team not found" };

    const trimmed = displayName.trim();
    if (!trimmed || trimmed === tag.name) {
      const { error } = await supabase.from("cohort_team_names").delete().eq("cohort_id", cohortId).eq("tag_id", tagId);
      if (error) return { error: error.message };
      revalidatePath("/admin");
      revalidatePath("/journey");
      return {};
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("cohort_team_names")
      .upsert(
        { cohort_id: cohortId, tag_id: tagId, display_name: trimmed, updated_by: user?.id, updated_at: new Date().toISOString() },
        { onConflict: "cohort_id,tag_id" }
      );
    if (error) return { error: error.message };

    revalidatePath("/admin");
    revalidatePath("/journey");
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
    revalidatePath("/superadmin/tags");
    revalidatePath("/journey");
    revalidatePath("/trainer/members");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}
