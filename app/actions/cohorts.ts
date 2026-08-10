"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Cohort, CohortDate, CohortMember, CohortOption, CompanyBrand, Trainer } from "@/lib/types";

const COHORT_LOGOS_BUCKET = "cohort-logos";

/** Legacy composite string kept in sync on `cohorts.name` for read sites that
 * only need a single display string (emails, the cohort switcher, etc.). */
function composeCohortName(batchName: string, moduleName?: string | null): string {
  const batch = batchName.trim();
  const module_ = moduleName?.trim();
  return module_ ? `${batch} — ${module_}` : batch;
}

function mapMemberRow(m: {
  user_id: string;
  profiles: { id: string; full_name: string | null } | { id: string; full_name: string | null }[] | null;
  participant_tags?: { id: string; name: string } | { id: string; name: string }[] | null;
}): CohortMember {
  const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
  const tagRow = Array.isArray(m.participant_tags) ? m.participant_tags[0] : m.participant_tags;
  return {
    id: m.user_id,
    fullName: profile?.full_name ?? null,
    email: null,
    tag: tagRow ? { id: tagRow.id, name: tagRow.name } : null,
  };
}

async function withMemberEmails(
  admin: ReturnType<typeof createAdminClient>,
  members: CohortMember[],
): Promise<CohortMember[]> {
  if (members.length === 0) return members;
  const memberIds = new Set(members.map((member) => member.id));
  const emailMap = new Map<string, string>();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const user of data?.users ?? []) {
    if (memberIds.has(user.id) && user.email) emailMap.set(user.id, user.email);
  }
  return members.map((member) => ({
    ...member,
    email: emailMap.get(member.id) ?? null,
  }));
}

async function loadTrainerMap(
  supabase: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>,
  trainerIds: (string | null)[],
): Promise<Map<string, Trainer>> {
  const ids = [...new Set(trainerIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from("trainers").select("id, name, image_url").in("id", ids);
  return new Map((data ?? []).map((row: { id: string; name: string; image_url: string | null }) => [
    row.id,
    { id: row.id, name: row.name, imageUrl: row.image_url },
  ]));
}

/** Every cohort_dates row for a batch of cohorts, grouped and sorted ascending
 * per cohort — the shape Cohort.dates needs. */
async function loadCohortDatesMap(
  supabase: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>,
  cohortIds: string[],
): Promise<Map<string, string[]>> {
  const ids = [...new Set(cohortIds)];
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from("cohort_dates")
    .select("cohort_id, event_date")
    .in("cohort_id", ids)
    .order("event_date", { ascending: true });
  const map = new Map<string, string[]>();
  for (const row of (data ?? []) as { cohort_id: string; event_date: string }[]) {
    const list = map.get(row.cohort_id) ?? [];
    list.push(row.event_date);
    map.set(row.cohort_id, list);
  }
  return map;
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
  batchName: string;
  moduleName?: string;
  description?: string;
  trainingContent?: string;
  businessContext?: string;
  /** Optional single date to seed cohort_dates with — more can be added afterwards. */
  initialDate?: string;
  companyId?: string;
}): Promise<{ error?: string; id?: string }> {
  try {
    const { supabase, userId, companyId, role } = await getAdminContext();
    const resolvedCompanyId = role === "admin" ? companyId : params.companyId;
    if (!resolvedCompanyId) return { error: "Company required" };

    const batchName = params.batchName.trim();
    const moduleName = params.moduleName?.trim() || null;

    const { data, error } = await supabase
      .from("cohorts")
      .insert({
        company_id: resolvedCompanyId,
        created_by: userId,
        batch_name: batchName,
        module_name: moduleName,
        name: composeCohortName(batchName, moduleName),
        description: params.description?.trim() || null,
        training_content: role === "superadmin" ? params.trainingContent?.trim() || null : null,
        business_context: role === "superadmin" ? params.businessContext?.trim() || null : null,
      })
      .select("id")
      .single();

    if (error) return { error: error.message };

    if (params.initialDate) {
      await supabase.from("cohort_dates").insert({ cohort_id: data.id, event_date: params.initialDate, created_by: userId });
    }

    revalidatePath("/admin");
    return { id: data.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateCohort(
  id: string,
  params: {
    batchName?: string;
    moduleName?: string;
    description?: string;
    trainingContent?: string;
    businessContext?: string;
    logoUrl?: string | null;
    trainerId?: string | null;
  }
): Promise<{ error?: string }> {
  try {
    const { supabase, companyId, role } = await getAdminContext();

    if (role === "admin") {
      const { data: cohort } = await supabase.from("cohorts").select("company_id").eq("id", id).single();
      if (!cohort || cohort.company_id !== companyId) return { error: "Cohort not found or access denied" };
      if (params.trainingContent !== undefined || params.businessContext !== undefined) {
        return { error: "Only a superadmin can change action generation context" };
      }
      if (params.trainerId !== undefined) {
        return { error: "Only a superadmin can assign this cohort's trainer" };
      }
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (params.batchName != null || params.moduleName !== undefined) {
      // Only one part may have been passed in — fetch the other so the
      // derived `name` composite (and the untouched part) stays correct.
      const { data: current } = await supabase.from("cohorts").select("batch_name, module_name").eq("id", id).single();
      const nextBatchName = params.batchName != null ? params.batchName.trim() : current?.batch_name ?? "";
      const nextModuleName = params.moduleName !== undefined ? params.moduleName.trim() || null : current?.module_name ?? null;
      updates.batch_name = nextBatchName;
      updates.module_name = nextModuleName;
      updates.name = composeCohortName(nextBatchName, nextModuleName);
    }
    if (params.description != null) updates.description = params.description.trim() || null;
    if (params.trainingContent != null) updates.training_content = params.trainingContent.trim() || null;
    if (params.businessContext != null) updates.business_context = params.businessContext.trim() || null;
    if (params.logoUrl !== undefined) updates.logo_url = params.logoUrl?.trim() || null;
    if (params.trainerId !== undefined) updates.trainer_id = params.trainerId || null;

    const { error } = await supabase.from("cohorts").update(updates).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/admin");
    revalidatePath("/journey");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/** The full list of dates on one cohort, with ids so each can be removed
 * individually — used by the cohort management "manage dates" list. */
export async function listCohortDates(cohortId: string): Promise<{ error?: string; dates?: CohortDate[] }> {
  try {
    const { supabase, companyId, role } = await getAdminContext();
    if (role === "admin") {
      const { data: cohort } = await supabase.from("cohorts").select("company_id").eq("id", cohortId).single();
      if (!cohort || cohort.company_id !== companyId) return { error: "Cohort not found or access denied" };
    }

    const { data, error } = await supabase
      .from("cohort_dates")
      .select("id, event_date")
      .eq("cohort_id", cohortId)
      .order("event_date", { ascending: true });
    if (error) return { error: error.message };
    return { dates: (data ?? []).map((row: { id: string; event_date: string }) => ({ id: row.id, date: row.event_date })) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function addCohortDate(cohortId: string, date: string): Promise<{ error?: string; id?: string }> {
  try {
    const { supabase, userId, companyId, role } = await getAdminContext();
    if (role === "admin") {
      const { data: cohort } = await supabase.from("cohorts").select("company_id").eq("id", cohortId).single();
      if (!cohort || cohort.company_id !== companyId) return { error: "Cohort not found or access denied" };
    }
    if (!date) return { error: "Date is required" };

    const { data, error } = await supabase
      .from("cohort_dates")
      .insert({ cohort_id: cohortId, event_date: date, created_by: userId })
      .select("id")
      .single();
    if (error) return { error: error.message };

    revalidatePath("/admin");
    revalidatePath("/journey");
    return { id: data.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function removeCohortDate(cohortId: string, dateId: string): Promise<{ error?: string }> {
  try {
    const { supabase, companyId, role } = await getAdminContext();
    if (role === "admin") {
      const { data: cohort } = await supabase.from("cohorts").select("company_id").eq("id", cohortId).single();
      if (!cohort || cohort.company_id !== companyId) return { error: "Cohort not found or access denied" };
    }

    const { error } = await supabase.from("cohort_dates").delete().eq("id", dateId).eq("cohort_id", cohortId);
    if (error) return { error: error.message };

    revalidatePath("/admin");
    revalidatePath("/journey");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function createSignedCohortLogoUploadUrl(
  cohortId: string,
  fileExtension: string
): Promise<{ error?: string; path?: string; token?: string; publicUrl?: string }> {
  try {
    const { companyId, role } = await getAdminContext();
    const admin = createAdminClient();
    const { data: cohort } = await admin.from("cohorts").select("id, company_id").eq("id", cohortId).single();
    if (!cohort) return { error: "Cohort not found" };
    if (role === "admin" && cohort.company_id !== companyId) return { error: "Access denied" };

    const safeExt = fileExtension.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5).toLowerCase() || "png";
    const path = `${cohortId}/${crypto.randomUUID()}.${safeExt}`;
    const { data, error } = await admin.storage.from(COHORT_LOGOS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { error: error?.message ?? "Failed to prepare cohort logo upload" };

    const { data: publicUrlData } = admin.storage.from(COHORT_LOGOS_BUCKET).getPublicUrl(path);
    return { path, token: data.token, publicUrl: publicUrlData.publicUrl };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to prepare cohort logo upload" };
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
    revalidatePath("/admin/control-panel/cohorts");
    revalidatePath("/superadmin/cohorts");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteCohort(id: string): Promise<{ error?: string }> {
  try {
    const { supabase, companyId, role } = await getAdminContext();

    if (role === "admin") {
      const { data: cohort } = await supabase.from("cohorts").select("company_id").eq("id", id).single();
      if (!cohort || cohort.company_id !== companyId) return { error: "Cohort not found or access denied" };
    }

    const { error } = await supabase.from("cohorts").delete().eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/admin");
    revalidatePath("/admin/control-panel/cohorts");
    revalidatePath("/superadmin/cohorts");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function listCohorts(companyId: string): Promise<{
  error?: string;
  company?: CompanyBrand;
  cohorts?: (Cohort & { contentCount: number })[];
}> {
  try {
    const { supabase, companyId: myCompanyId, role } = await getAdminContext();
    if (role === "admin" && myCompanyId !== companyId) return { error: "Access denied" };

    const [{ data: company }, { data: cohorts }] = await Promise.all([
      supabase.from("companies").select("id, name, logo_url").eq("id", companyId).single(),
      supabase
        .from("cohorts")
        .select("id, name, batch_name, module_name, description, training_content, business_context, logo_url, trainer_id")
        .eq("company_id", companyId)
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
    ]);

    const companyBrand = company ? { id: company.id, name: company.name, logoUrl: company.logo_url } : undefined;
    if (!cohorts?.length) return { company: companyBrand, cohorts: [] };
    const cohortIds = cohorts.map((c: { id: string }) => c.id);

    const [{ data: members }, { data: contentAssignments }, trainerMap, datesMap] = await Promise.all([
      supabase.from("cohort_members").select("cohort_id").in("cohort_id", cohortIds),
      supabase.from("cohort_prepare_assignments").select("cohort_id").in("cohort_id", cohortIds),
      loadTrainerMap(supabase, cohorts.map((c: { trainer_id: string | null }) => c.trainer_id)),
      loadCohortDatesMap(supabase, cohortIds),
    ]);
    const memberCounts = new Map<string, number>();
    for (const m of (members ?? []) as { cohort_id: string }[]) {
      memberCounts.set(m.cohort_id, (memberCounts.get(m.cohort_id) ?? 0) + 1);
    }
    const contentCounts = new Map<string, number>();
    for (const a of (contentAssignments ?? []) as { cohort_id: string }[]) {
      contentCounts.set(a.cohort_id, (contentCounts.get(a.cohort_id) ?? 0) + 1);
    }

    return {
      company: companyBrand,
      cohorts: cohorts.map((c: { id: string; name: string; batch_name: string; module_name: string | null; description: string | null; training_content: string | null; business_context: string | null; logo_url: string | null; trainer_id: string | null }) => ({
        id: c.id,
        name: c.name,
        batchName: c.batch_name,
        moduleName: c.module_name,
        description: c.description,
        trainingContent: c.training_content,
        businessContext: c.business_context,
        dates: datesMap.get(c.id) ?? [],
        logoUrl: c.logo_url,
        memberCount: memberCounts.get(c.id) ?? 0,
        contentCount: contentCounts.get(c.id) ?? 0,
        trainerId: c.trainer_id,
        trainer: c.trainer_id ? trainerMap.get(c.trainer_id) ?? null : null,
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
      .select("id, name, batch_name, module_name, description, training_content, business_context, logo_url, company_id, trainer_id")
      .eq("id", cohortId)
      .single();
    if (!cohort) return { error: "Cohort not found" };
    if (role === "admin" && cohort.company_id !== myCompanyId) return { error: "Access denied" };

    // Admin client: same profiles-RLS gap as getCompanyUsers above — a superadmin
    // viewing another company's cohort would otherwise get every member's name
    // silently nulled out by RLS on the embedded profiles join.
    const admin = createAdminClient();
    const [{ data: members }, trainerMap, datesMap] = await Promise.all([
      admin
        .from("cohort_members")
        .select("user_id, profiles!cohort_members_user_id_fkey(id, full_name), participant_tags(id, name)")
        .eq("cohort_id", cohortId),
      loadTrainerMap(admin, [cohort.trainer_id]),
      loadCohortDatesMap(admin, [cohortId]),
    ]);

    return {
      cohort: {
        id: cohort.id,
        name: cohort.name,
        batchName: cohort.batch_name,
        moduleName: cohort.module_name,
        description: cohort.description,
        trainingContent: cohort.training_content,
        businessContext: cohort.business_context,
        dates: datesMap.get(cohortId) ?? [],
        logoUrl: cohort.logo_url,
        memberCount: members?.length ?? 0,
        trainerId: cohort.trainer_id,
        trainer: cohort.trainer_id ? trainerMap.get(cohort.trainer_id) ?? null : null,
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

      // Upsert does not fire the INSERT trigger when the membership already
      // exists. Explicitly make this the user's current cohort in both cases.
      await admin
        .from("profiles")
        .update({ current_cohort_id: cohortId, selected_cohort_id: cohortId })
        .eq("id", userId);
      await admin
        .from("personal_action_subscriptions")
        .update({ is_active: false, archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("archived_at", null)
        .or(`cohort_id.is.null,cohort_id.neq.${cohortId}`);
      await admin
        .from("personal_action_generation_jobs")
        .update({ status: "failed", error_message: "Archived when participant moved to another cohort", updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("status", "generating")
        .or(`cohort_id.is.null,cohort_id.neq.${cohortId}`);
    }

    revalidatePath("/admin");
    revalidatePath("/journey");
    revalidatePath("/plan");
    revalidatePath("/actions");
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

/**
 * Every cohort the caller may view, plus the separate current/selected flags.
 * Participants retain old memberships for history; trainers can switch between
 * the cohorts they manage in their company.
 */
export async function getMyCohorts(): Promise<{
  error?: string;
  cohorts: CohortOption[];
  selectedCohortId: string | null;
  currentCohortId: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", cohorts: [], selectedCohortId: null, currentCohortId: null };

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, company_id, current_cohort_id, selected_cohort_id")
      .eq("id", user.id)
      .single();
    if (profileError) {
      return {
        error: profileError.message,
        cohorts: [],
        selectedCohortId: null,
        currentCohortId: null,
      };
    }
    if (!profile) return { error: "Profile not found", cohorts: [], selectedCohortId: null, currentCohortId: null };

    const admin = createAdminClient();
    let orderedIds: string[] = [];

    if (profile.role === "user") {
      const { data: memberships } = await admin
        .from("cohort_members")
        .select("cohort_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      orderedIds = (memberships ?? []).map((membership) => membership.cohort_id);
    } else if (profile.role === "admin" && profile.company_id) {
      const { data: managed } = await admin
        .from("cohorts")
        .select("id")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false });
      orderedIds = (managed ?? []).map((cohort) => cohort.id);
    } else if (profile.role === "trainer") {
      const { data: trainerRow } = await admin.from("trainers").select("id").eq("user_id", user.id).maybeSingle();
      if (trainerRow) {
        const { data: run } = await admin
          .from("cohorts")
          .select("id")
          .eq("trainer_id", trainerRow.id)
          .order("created_at", { ascending: false });
        orderedIds = (run ?? []).map((cohort) => cohort.id);
      }
    } else {
      const { data: managed } = await admin
        .from("cohorts")
        .select("id")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false });
      orderedIds = (managed ?? []).map((cohort) => cohort.id);
    }

    if (!orderedIds.length) {
      return { cohorts: [], selectedCohortId: null, currentCohortId: null };
    }

    const [{ data: cohortRows }, { data: memberRows }] = await Promise.all([
      admin
        .from("cohorts")
        .select("id, name, batch_name, module_name, description, logo_url, company_id, archived_at, trainer_id")
        .in("id", orderedIds),
      admin
        .from("cohort_members")
        .select("cohort_id")
        .in("cohort_id", orderedIds),
    ]);

    const cohortById = new Map((cohortRows ?? []).map((cohort) => [cohort.id, cohort]));
    const trainerMap = await loadTrainerMap(admin, (cohortRows ?? []).map((cohort) => cohort.trainer_id));
    const datesMap = await loadCohortDatesMap(admin, (cohortRows ?? []).map((cohort) => cohort.id));
    const companyIds = Array.from(new Set((cohortRows ?? []).map((cohort) => cohort.company_id)));
    const { data: companyRows } = companyIds.length
      ? await admin.from("companies").select("id, name, logo_url").in("id", companyIds)
      : { data: [] as { id: string; name: string; logo_url: string | null }[] };
    const companyById = new Map((companyRows ?? []).map((company) => [company.id, company]));
    const memberCounts = new Map<string, number>();
    for (const row of memberRows ?? []) {
      memberCounts.set(row.cohort_id, (memberCounts.get(row.cohort_id) ?? 0) + 1);
    }

    const accessibleIds = orderedIds.filter((id) => cohortById.has(id));
    const currentCohortId = accessibleIds.includes(profile.current_cohort_id)
      ? profile.current_cohort_id
      : accessibleIds[0] ?? null;
    const selectedCohortId = accessibleIds.includes(profile.selected_cohort_id)
      ? profile.selected_cohort_id
      : currentCohortId;

    if (selectedCohortId && selectedCohortId !== profile.selected_cohort_id) {
      await supabase.from("profiles").update({ selected_cohort_id: selectedCohortId }).eq("id", user.id);
    }

    const cohorts: CohortOption[] = accessibleIds.map((id) => {
      const row = cohortById.get(id)!;
      const company = companyById.get(row.company_id);
      return {
        id: row.id,
        name: row.name,
        batchName: row.batch_name,
        moduleName: row.module_name,
        description: row.description,
        dates: datesMap.get(row.id) ?? [],
        logoUrl: row.logo_url,
        memberCount: memberCounts.get(row.id) ?? 0,
        companyId: row.company_id,
        companyName: company?.name ?? null,
        companyLogoUrl: company?.logo_url ?? null,
        archivedAt: row.archived_at,
        isCurrent: row.id === currentCohortId,
        isSelected: row.id === selectedCohortId,
        trainerId: row.trainer_id,
        trainer: row.trainer_id ? trainerMap.get(row.trainer_id) ?? null : null,
      };
    });

    return { cohorts, selectedCohortId, currentCohortId };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to load cohorts",
      cohorts: [],
      selectedCohortId: null,
      currentCohortId: null,
    };
  }
}

/** Change only the viewing context. This never reactivates or archives a plan. */
export async function selectMyCohort(cohortId: string): Promise<{ error?: string }> {
  const context = await getMyCohorts();
  if (context.error) return { error: context.error };
  if (!context.cohorts.some((cohort) => cohort.id === cohortId)) return { error: "You do not have access to this cohort" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("profiles").update({ selected_cohort_id: cohortId }).eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/journey");
  revalidatePath("/notes");
  revalidatePath("/plan");
  revalidatePath("/actions");
  revalidatePath("/wallet");
  revalidatePath("/progress");
  return {};
}

/** Selected logged-in cohort + roster, for participant pages. */
export async function getMyCohort(): Promise<{
  error?: string;
  cohort?: (Cohort & { companyId: string }) | null;
  roster?: CohortMember[];
}> {
  try {
    const context = await getMyCohorts();
    if (context.error) return { error: context.error };
    const selected = context.cohorts.find((cohort) => cohort.isSelected) ?? null;
    const cohortId = selected?.id ?? null;
    if (!cohortId) return { cohort: null, roster: [] };

    // Admin client: a plain member's own cohort_members row satisfies RLS
    // (user_id = auth.uid()), but the embedded profiles join for their
    // *fellow* members isn't covered by any regular-user SELECT policy on
    // profiles — without this, "Learn alongside N colleagues" would only
    // ever resolve the current user's own name.
    const admin = createAdminClient();
    const { data: members } = await admin
      .from("cohort_members")
      .select("user_id, profiles!cohort_members_user_id_fkey(id, full_name), participant_tags(id, name)")
      .eq("cohort_id", cohortId);

    const roster = await withMemberEmails(admin, (members ?? []).map(mapMemberRow));

    return {
      cohort: {
        id: selected!.id,
        name: selected!.name,
        batchName: selected!.batchName,
        moduleName: selected!.moduleName,
        description: selected!.description,
        dates: selected!.dates,
        logoUrl: selected!.logoUrl,
        memberCount: roster.length,
        companyId: selected!.companyId,
        companyName: selected!.companyName,
        companyLogoUrl: selected!.companyLogoUrl,
        trainerId: selected!.trainerId,
        trainer: selected!.trainer,
      },
      roster,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}
