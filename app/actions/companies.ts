"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const COMPANY_LOGOS_BUCKET = "company-logos";

const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || "admin@actionengine").toLowerCase();

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
  return supabase;
}

/** Parses and sanity-checks the optional "program agenda" JSON a superadmin
 * pastes in when creating/editing a company. Returns undefined (no change)
 * when the field was left blank, or an error message when the JSON doesn't
 * parse or doesn't look like a phase array. */
function parseProgramPhasesJson(raw: string | undefined): { phases?: unknown[]; error?: string } {
  if (raw === undefined) return {};
  const trimmed = raw.trim();
  if (!trimmed) return { phases: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { error: "Program agenda must be valid JSON (an array of phases)." };
  }
  if (!Array.isArray(parsed)) return { error: "Program agenda JSON must be an array of phases." };
  for (const phase of parsed) {
    if (!phase || typeof phase !== "object" || typeof (phase as Record<string, unknown>).id !== "string" || typeof (phase as Record<string, unknown>).label !== "string") {
      return { error: 'Each phase needs at least an "id" and a "label" string.' };
    }
  }
  return { phases: parsed };
}

export async function createCompany(params: {
  name: string;
  slug?: string;
  logoUrl?: string;
  programPhasesJson?: string;
}): Promise<{ error?: string; id?: string }> {
  try {
    const supabase = await ensureSuperadmin();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { phases, error: phasesError } = parseProgramPhasesJson(params.programPhasesJson);
    if (phasesError) return { error: phasesError };

    const { data, error } = await supabase
      .from("companies")
      .insert({
        name: params.name.trim(),
        slug: params.slug?.trim() || null,
        logo_url: params.logoUrl?.trim() || null,
        program_phases: phases ?? [],
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) return { error: error.message };
    revalidatePath("/superadmin");
    return { id: data.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateCompany(
  id: string,
  params: { name: string; slug?: string; logoUrl?: string | null; programPhasesJson?: string }
): Promise<{ error?: string }> {
  try {
    await ensureSuperadmin();
    const supabase = await createClient();

    const { phases, error: phasesError } = parseProgramPhasesJson(params.programPhasesJson);
    if (phasesError) return { error: phasesError };

    const updates: Record<string, string | null | unknown[]> = {
      name: params.name.trim(),
      slug: params.slug?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (params.logoUrl !== undefined) updates.logo_url = params.logoUrl?.trim() || null;
    if (phases !== undefined) updates.program_phases = phases;

    const { error } = await supabase
      .from("companies")
      .update(updates)
      .eq("id", id);

    if (error) return { error: error.message };
    revalidatePath("/superadmin");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Prepare a direct browser-to-storage company-logo upload. */
export async function createSignedCompanyLogoUploadUrl(
  companyId: string | null,
  fileExtension: string
): Promise<{ error?: string; path?: string; token?: string; publicUrl?: string }> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();
    if (companyId) {
      const { data: company } = await admin.from("companies").select("id").eq("id", companyId).single();
      if (!company) return { error: "Company not found" };
    }

    const safeExt = fileExtension.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5).toLowerCase() || "png";
    const path = `${companyId || "new"}/${crypto.randomUUID()}.${safeExt}`;
    const { data, error } = await admin.storage.from(COMPANY_LOGOS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { error: error?.message ?? "Failed to prepare logo upload" };

    const { data: publicUrlData } = admin.storage.from(COMPANY_LOGOS_BUCKET).getPublicUrl(path);
    return { path, token: data.token, publicUrl: publicUrlData.publicUrl };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to prepare logo upload" };
  }
}
