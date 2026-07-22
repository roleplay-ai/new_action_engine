"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Cohort, CohortMember } from "@/lib/types";

function mapMemberRow(m: {
  user_id: string;
  profiles: { id: string; full_name: string | null } | { id: string; full_name: string | null }[] | null;
}): CohortMember {
  const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
  return { id: m.user_id, fullName: profile?.full_name ?? null };
}

async function getAdminContext(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  companyId: string | null;
  role: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "user";
  if (role !== "admin" && role !== "superadmin") {
    throw new Error("Forbidden: admin or superadmin only");
  }

  return {
    supabase,
    userId: user.id,
    companyId: profile?.company_id ?? null,
    role,
  };
}

/** Plain 'user'-role accounts in a company, for the cohort member picker.
 * Uses the service-role client: profiles' RLS only lets a company admin read
 * rows in their OWN company, and a superadmin's own company_id is null, so a
 * superadmin browsing another company's users would be silently RLS-filtered
 * to zero rows via the regular client — authorization is already enforced by
 * getAdminContext() above, so bypassing RLS here is safe. */
export async function getCompanyUsers(companyId: string): Promise<
  { error?: string; users?: { id: string; full_name: string | null }[] }> {
  try {
    const { companyId: myCompanyId, role } = await getAdminContext();
    if (role === "admin" && myCompanyId !== companyId) return { error: "Access denied" };

    const admin = createAdminClient();
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, full_name")
      .eq("company_id", companyId)
      .eq("role", "user");
    if (error) return { error: error.message };

    return { users: (profiles ?? []).map((p) => ({ id: p.id, full_name: p.full_name })) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function createCohort(params: {
  name: string;
  description?: string;
  startDate?: string;
  companyId?: string;
}): Promise<{ error?: string; id?: string }> {
  try {
    const { supabase, userId, companyId, role } = await getAdminContext();
    const resolvedCompanyId = role === "admin" ? companyId : params.companyId;
    if (!resolvedCompanyId) return { error: "Company required" };

    const { data, error } = await supabase
      .from("cohorts")
      .insert({
        company_id: resolvedCompanyId,
        created_by: userId,
        name: params.name.trim(),
        description: params.description?.trim() || null,
        start_date: params.startDate || null,
      })
      .select("id")
      .single();

    if (error) return { error: error.message };
    revalidatePath("/admin");
    return { id: data.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateCohort(
  id: string,
  params: { name?: string; description?: string; startDate?: string }
): Promise<{ error?: string }> {
  try {
    const { supabase, companyId, role } = await getAdminContext();

    if (role === "admin") {
      const { data: cohort } = await supabase.from("cohorts").select("company_id").eq("id", id).single();
      if (!cohort || cohort.company_id !== companyId) return { error: "Cohort not found or access denied" };
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (params.name != null) updates.name = params.name.trim();
    if (params.description != null) updates.description = params.description.trim() || null;
    if (params.startDate != null) updates.start_date = params.startDate || null;

    const { error } = await supabase.from("cohorts").update(updates).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/admin");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function archiveCohort(id: string): Promise<{ error?: string }> {
  try {
    const { supabase, companyId, role } = await getAdminContext();

    if (role === "admin") {
      const { data: cohort } = await supabase.from("cohorts").select("company_id").eq("id", id).single();
      if (!cohort || cohort.company_id !== companyId) return { error: "Cohort not found or access denied" };
    }

    const { error } = await supabase
      .from("cohorts")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/admin");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function listCohorts(companyId: string): Promise<{
  error?: string;
  cohorts?: (Cohort & { contentCount: number })[];
}> {
  try {
    const { supabase, companyId: myCompanyId, role } = await getAdminContext();
    if (role === "admin" && myCompanyId !== companyId) return { error: "Access denied" };

    const { data: cohorts } = await supabase
      .from("cohorts")
      .select("id, name, description, start_date")
      .eq("company_id", companyId)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (!cohorts?.length) return { cohorts: [] };
    const cohortIds = cohorts.map((c: { id: string }) => c.id);

    const { data: members } = await supabase
      .from("cohort_members")
      .select("cohort_id")
      .in("cohort_id", cohortIds);
    const memberCounts = new Map<string, number>();
    for (const m of (members ?? []) as { cohort_id: string }[]) {
      memberCounts.set(m.cohort_id, (memberCounts.get(m.cohort_id) ?? 0) + 1);
    }

    const { data: contentAssignments } = await supabase
      .from("cohort_prepare_assignments")
      .select("cohort_id")
      .in("cohort_id", cohortIds);
    const contentCounts = new Map<string, number>();
    for (const a of (contentAssignments ?? []) as { cohort_id: string }[]) {
      contentCounts.set(a.cohort_id, (contentCounts.get(a.cohort_id) ?? 0) + 1);
    }

    return {
      cohorts: cohorts.map((c: { id: string; name: string; description: string | null; start_date: string | null }) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        startDate: c.start_date,
        memberCount: memberCounts.get(c.id) ?? 0,
        contentCount: contentCounts.get(c.id) ?? 0,
      })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function getCohortDetail(cohortId: string): Promise<{
  error?: string;
  cohort?: Cohort;
  members?: CohortMember[];
}> {
  try {
    const { supabase, companyId: myCompanyId, role } = await getAdminContext();

    const { data: cohort } = await supabase
      .from("cohorts")
      .select("id, name, description, start_date, company_id")
      .eq("id", cohortId)
      .single();
    if (!cohort) return { error: "Cohort not found" };
    if (role === "admin" && cohort.company_id !== myCompanyId) return { error: "Access denied" };

    // Admin client: same profiles-RLS gap as getCompanyUsers above — a superadmin
    // viewing another company's cohort would otherwise get every member's name
    // silently nulled out by RLS on the embedded profiles join.
    const admin = createAdminClient();
    const { data: members } = await admin
      .from("cohort_members")
      .select("user_id, profiles!cohort_members_user_id_fkey(id, full_name)")
      .eq("cohort_id", cohortId);

    return {
      cohort: {
        id: cohort.id,
        name: cohort.name,
        description: cohort.description,
        startDate: cohort.start_date,
        memberCount: members?.length ?? 0,
      },
      members: (members ?? []).map(mapMemberRow),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function addMembersToCohort(cohortId: string, userIds: string[]): Promise<{ error?: string }> {
  try {
    const { supabase, companyId: myCompanyId, role } = await getAdminContext();

    const { data: cohort } = await supabase.from("cohorts").select("company_id").eq("id", cohortId).single();
    if (!cohort) return { error: "Cohort not found" };
    if (role === "admin" && cohort.company_id !== myCompanyId) return { error: "Access denied" };

    // Admin client: same profiles-RLS gap — otherwise a superadmin's own (null)
    // company_id never matches, every userId looks "invalid", and this fails.
    const admin = createAdminClient();
    const { data: companyUsers } = await admin
      .from("profiles")
      .select("id")
      .eq("company_id", cohort.company_id)
      .in("id", userIds);
    const validIds = new Set((companyUsers ?? []).map((u: { id: string }) => u.id));
    const invalid = userIds.filter((id) => !validIds.has(id));
    if (invalid.length) return { error: "Some users do not belong to this cohort's company" };

    const {
      data: { user },
    } = await supabase.auth.getUser();

    for (const userId of userIds) {
      const { error } = await supabase
        .from("cohort_members")
        .upsert({ cohort_id: cohortId, user_id: userId, added_by: user?.id }, { onConflict: "cohort_id,user_id" });
      if (error) return { error: error.message };
    }

    revalidatePath("/admin");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function removeMembersFromCohort(cohortId: string, userIds: string[]): Promise<{ error?: string }> {
  try {
    const { supabase, companyId: myCompanyId, role } = await getAdminContext();

    const { data: cohort } = await supabase.from("cohorts").select("company_id").eq("id", cohortId).single();
    if (!cohort) return { error: "Cohort not found" };
    if (role === "admin" && cohort.company_id !== myCompanyId) return { error: "Access denied" };

    const { error } = await supabase
      .from("cohort_members")
      .delete()
      .eq("cohort_id", cohortId)
      .in("user_id", userIds);
    if (error) return { error: error.message };

    revalidatePath("/admin");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Current logged-in user's cohort (first one, if any) + roster, for the Prepare/Progress pages. */
export async function getMyCohort(): Promise<{
  error?: string;
  cohort?: (Cohort & { companyId: string }) | null;
  roster?: CohortMember[];
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: membership } = await supabase
      .from("cohort_members")
      .select("cohort_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    let cohortId = membership?.cohort_id ?? null;

    // Company admins are the trainer role in the current data model. They may
    // not be participant rows in cohort_members, so give them the Journey for
    // a cohort they created (or the first cohort in their company as fallback).
    if (!cohortId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, company_id")
        .eq("id", user.id)
        .single();
      if (profile?.role === "admin" || profile?.role === "superadmin") {
        let createdQuery = supabase
          .from("cohorts")
          .select("id")
          .eq("created_by", user.id)
          .is("archived_at", null)
          .order("created_at", { ascending: false })
          .limit(1);
        if (profile.role === "admin") createdQuery = createdQuery.eq("company_id", profile.company_id);
        const { data: createdCohort } = await createdQuery.maybeSingle();
        cohortId = createdCohort?.id ?? null;

        if (!cohortId) {
          let managedQuery = supabase
            .from("cohorts")
            .select("id")
            .is("archived_at", null)
            .order("created_at", { ascending: false })
            .limit(1);
          if (profile.role === "admin") managedQuery = managedQuery.eq("company_id", profile.company_id);
          const { data: managedCohort } = await managedQuery.maybeSingle();
          cohortId = managedCohort?.id ?? null;
        }
      }
    }

    if (!cohortId) return { cohort: null, roster: [] };

    const { data: cohort } = await supabase
      .from("cohorts")
      .select("id, name, description, start_date, company_id")
      .eq("id", cohortId)
      .single();
    if (!cohort) return { cohort: null, roster: [] };

    // Admin client: a plain member's own cohort_members row satisfies RLS
    // (user_id = auth.uid()), but the embedded profiles join for their
    // *fellow* members isn't covered by any regular-user SELECT policy on
    // profiles — without this, "Learn alongside N colleagues" would only
    // ever resolve the current user's own name.
    const admin = createAdminClient();
    const { data: members } = await admin
      .from("cohort_members")
      .select("user_id, profiles!cohort_members_user_id_fkey(id, full_name)")
      .eq("cohort_id", cohort.id);

    const roster = (members ?? []).map(mapMemberRow);

    return {
      cohort: {
        id: cohort.id,
        name: cohort.name,
        description: cohort.description,
        startDate: cohort.start_date,
        memberCount: roster.length,
        companyId: cohort.company_id,
      },
      roster,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}
