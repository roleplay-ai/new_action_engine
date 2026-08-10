"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Facilitator } from "@/lib/types";

const FACILITATOR_DOCS_BUCKET = "facilitator-documents";

type FacilitatorAccess = { supabase: Awaited<ReturnType<typeof createClient>>; userId: string };

/** Superadmin, or the signed-in trainer running this cohort — the only two
 * roles allowed to add/edit/remove facilitators (matches the facilitators
 * RLS policies in 059_trainer_login_facilitators_and_notices.sql). */
async function ensureFacilitatorManager(cohortId: string): Promise<FacilitatorAccess | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile) return { error: "Profile not found" };

  if (profile.role === "superadmin") return { supabase, userId: user.id };

  if (profile.role === "trainer") {
    const { data: cohort } = await supabase.from("cohorts").select("id").eq("id", cohortId).maybeSingle();
    if (cohort) return { supabase, userId: user.id };
  }

  return { error: "Only a superadmin or this batch's trainer can manage facilitators" };
}

function mapFacilitatorRow(row: {
  id: string;
  cohort_id: string;
  name: string;
  designation: string;
  pdf_url: string | null;
  pdf_name: string | null;
}): Facilitator {
  return {
    id: row.id,
    cohortId: row.cohort_id,
    name: row.name,
    designation: row.designation,
    pdfUrl: row.pdf_url,
    pdfName: row.pdf_name,
  };
}

/** The facilitator roster for a cohort — readable by its members, admin/
 * superadmin, and the cohort's trainer (enforced by RLS on the regular client). */
export async function listFacilitators(cohortId: string): Promise<{ error?: string; facilitators?: Facilitator[] }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data, error } = await supabase
      .from("facilitators")
      .select("id, cohort_id, name, designation, pdf_url, pdf_name")
      .eq("cohort_id", cohortId)
      .order("created_at", { ascending: true });
    if (error) return { error: error.message };
    return { facilitators: (data ?? []).map(mapFacilitatorRow) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not load facilitators" };
  }
}

export async function createFacilitator(
  cohortId: string,
  params: { name: string; designation: string; pdfUrl?: string | null; pdfName?: string | null }
): Promise<{ error?: string; id?: string }> {
  try {
    const access = await ensureFacilitatorManager(cohortId);
    if ("error" in access) return { error: access.error };

    const name = params.name.trim();
    const designation = params.designation.trim();
    if (!name) return { error: "Facilitator name is required" };
    if (!designation) return { error: "Designation is required" };

    const { data, error } = await access.supabase
      .from("facilitators")
      .insert({
        cohort_id: cohortId,
        created_by: access.userId,
        name,
        designation,
        pdf_url: params.pdfUrl?.trim() || null,
        pdf_name: params.pdfName?.trim() || null,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };

    revalidatePath("/superadmin/cohorts");
    revalidatePath("/admin/control-panel/cohorts");
    revalidatePath("/trainer/facilitators");
    revalidatePath("/journey");
    return { id: data.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not add the facilitator" };
  }
}

export async function updateFacilitator(
  cohortId: string,
  id: string,
  params: { name?: string; designation?: string; pdfUrl?: string | null; pdfName?: string | null }
): Promise<{ error?: string }> {
  try {
    const access = await ensureFacilitatorManager(cohortId);
    if ("error" in access) return { error: access.error };

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (params.name != null) {
      const name = params.name.trim();
      if (!name) return { error: "Facilitator name is required" };
      updates.name = name;
    }
    if (params.designation != null) {
      const designation = params.designation.trim();
      if (!designation) return { error: "Designation is required" };
      updates.designation = designation;
    }
    if (params.pdfUrl !== undefined) updates.pdf_url = params.pdfUrl?.trim() || null;
    if (params.pdfName !== undefined) updates.pdf_name = params.pdfName?.trim() || null;

    const { error } = await access.supabase.from("facilitators").update(updates).eq("id", id).eq("cohort_id", cohortId);
    if (error) return { error: error.message };

    revalidatePath("/superadmin/cohorts");
    revalidatePath("/admin/control-panel/cohorts");
    revalidatePath("/trainer/facilitators");
    revalidatePath("/journey");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update the facilitator" };
  }
}

export async function deleteFacilitator(cohortId: string, id: string): Promise<{ error?: string }> {
  try {
    const access = await ensureFacilitatorManager(cohortId);
    if ("error" in access) return { error: access.error };

    const { error } = await access.supabase.from("facilitators").delete().eq("id", id).eq("cohort_id", cohortId);
    if (error) return { error: error.message };

    revalidatePath("/superadmin/cohorts");
    revalidatePath("/admin/control-panel/cohorts");
    revalidatePath("/trainer/facilitators");
    revalidatePath("/journey");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not remove the facilitator" };
  }
}

/** Prepares a direct browser-to-storage upload for a facilitator's PDF: the
 * file's bytes never pass through our server. Mirrors createSignedTrainerImageUploadUrl. */
export async function createSignedFacilitatorPdfUploadUrl(
  cohortId: string,
  fileName: string
): Promise<{ error?: string; path?: string; token?: string; publicUrl?: string }> {
  try {
    const access = await ensureFacilitatorManager(cohortId);
    if ("error" in access) return { error: access.error };

    const admin = createAdminClient();
    const path = `${cohortId}/${crypto.randomUUID()}.pdf`;

    const { data, error } = await admin.storage.from(FACILITATOR_DOCS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { error: error?.message ?? "Failed to prepare the PDF upload" };

    const { data: publicUrlData } = admin.storage.from(FACILITATOR_DOCS_BUCKET).getPublicUrl(path);
    return { path, token: data.token, publicUrl: publicUrlData.publicUrl };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to prepare the PDF upload" };
  }
}
