"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || "admin@actionengine").toLowerCase();
const PAGE_SIZE = 1000;

async function ensureSuperadmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const isSuperadminEmail = user.email?.toLowerCase() === SUPERADMIN_EMAIL;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "superadmin" && !isSuperadminEmail) {
    throw new Error("Forbidden: superadmin only");
  }
}

export type CredentialBatch = {
  cohortId: string;
  batchName: string;
  moduleName: string | null;
};

export type StoredCredentialRow = {
  userId: string;
  email: string;
  password: string;
  fullName: string | null;
  role: string;
  companyId: string | null;
  companyName: string | null;
  batches: CredentialBatch[];
  createdAt: string;
};

/** PostgREST caps a response at ~1000 rows, so page until a short page comes back. */
async function selectAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Every stored login (email + plaintext password) from user_credential_delivery,
 * with the owner's profile, company and batch/module memberships for filtering.
 * Superadmin only — the table is service-role only because it holds plaintext passwords.
 */
export async function getStoredCredentials(): Promise<{ rows: StoredCredentialRow[]; error?: string }> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const credentials = await selectAllPages<{
      user_id: string;
      email: string;
      plaintext_password: string;
      created_at: string;
    }>((from, to) =>
      admin
        .from("user_credential_delivery")
        .select("user_id, email, plaintext_password, created_at")
        .order("created_at", { ascending: false })
        .range(from, to)
    );
    if (!credentials.length) return { rows: [] };

    const [profiles, companiesRes, cohortsRes, members] = await Promise.all([
      selectAllPages<{
        id: string;
        full_name: string | null;
        role: string | null;
        company_id: string | null;
        current_cohort_id: string | null;
      }>((from, to) =>
        admin.from("profiles").select("id, full_name, role, company_id, current_cohort_id").range(from, to)
      ),
      admin.from("companies").select("id, name"),
      admin.from("cohorts").select("id, batch_name, module_name").is("archived_at", null),
      selectAllPages<{ user_id: string; cohort_id: string }>((from, to) =>
        admin.from("cohort_members").select("user_id, cohort_id").range(from, to)
      ),
    ]);
    if (companiesRes.error) throw new Error(companiesRes.error.message);
    if (cohortsRes.error) throw new Error(cohortsRes.error.message);

    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const companyById = new Map((companiesRes.data ?? []).map((c) => [c.id as string, c.name as string]));
    const cohortById = new Map<string, CredentialBatch>(
      (cohortsRes.data ?? []).map((c) => [
        c.id as string,
        { cohortId: c.id as string, batchName: c.batch_name as string, moduleName: (c.module_name as string | null) ?? null },
      ])
    );

    const cohortIdsByUser = new Map<string, Set<string>>();
    for (const member of members) {
      const set = cohortIdsByUser.get(member.user_id) ?? new Set<string>();
      set.add(member.cohort_id);
      cohortIdsByUser.set(member.user_id, set);
    }

    const rows: StoredCredentialRow[] = credentials.map((credential) => {
      const profile = profileById.get(credential.user_id);
      const cohortIds = new Set(cohortIdsByUser.get(credential.user_id) ?? []);
      if (profile?.current_cohort_id) cohortIds.add(profile.current_cohort_id);

      // Archived cohorts are absent from cohortById, so they drop out here.
      const batches = [...cohortIds]
        .map((id) => cohortById.get(id))
        .filter((batch): batch is CredentialBatch => !!batch)
        .sort((a, b) => a.batchName.localeCompare(b.batchName) || (a.moduleName ?? "").localeCompare(b.moduleName ?? ""));

      return {
        userId: credential.user_id,
        email: credential.email,
        password: credential.plaintext_password,
        fullName: profile?.full_name ?? null,
        role: profile?.role ?? "user",
        companyId: profile?.company_id ?? null,
        companyName: profile?.company_id ? companyById.get(profile.company_id) ?? null : null,
        batches,
        createdAt: credential.created_at,
      };
    });

    return { rows };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "Failed" };
  }
}
