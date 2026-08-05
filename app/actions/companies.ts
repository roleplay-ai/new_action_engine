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

export async function createCompany(params: {
  name: string;
  slug?: string;
  logoUrl?: string;
}): Promise<{ error?: string; id?: string }> {
  try {
    const supabase = await ensureSuperadmin();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data, error } = await supabase
      .from("companies")
      .insert({
        name: params.name.trim(),
        slug: params.slug?.trim() || null,
        logo_url: params.logoUrl?.trim() || null,
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
  params: { name: string; slug?: string; logoUrl?: string | null }
): Promise<{ error?: string }> {
  try {
    await ensureSuperadmin();
    const supabase = await createClient();

    const updates: Record<string, string | null> = {
      name: params.name.trim(),
      slug: params.slug?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (params.logoUrl !== undefined) updates.logo_url = params.logoUrl?.trim() || null;

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
