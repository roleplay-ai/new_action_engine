"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Trainer } from "@/lib/types";

const TRAINER_IMAGES_BUCKET = "trainer-images";
const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || "admin@actionengine").toLowerCase();

async function ensureSuperadmin(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; userId: string }> {
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
  return { supabase, userId: user.id };
}

function mapTrainerRow(row: { id: string; name: string; image_url: string | null }): Trainer {
  return { id: row.id, name: row.name, imageUrl: row.image_url };
}

/** The full trainer roster, for the superadmin trainers page and the
 * per-cohort assignment dropdown. Readable by any authenticated user because
 * profile data (name/photo) is harmless — this action itself is unauthenticated
 * beyond that, mirroring prepare_content_items' read policy. */
export async function listTrainers(): Promise<{ error?: string; trainers?: Trainer[] }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data, error } = await supabase
      .from("trainers")
      .select("id, name, image_url")
      .order("name");
    if (error) return { error: error.message };
    return { trainers: (data ?? []).map(mapTrainerRow) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function createTrainer(params: { name: string; imageUrl?: string | null }): Promise<{
  error?: string;
  id?: string;
}> {
  try {
    const { supabase, userId } = await ensureSuperadmin();
    const name = params.name.trim();
    if (!name) return { error: "Trainer name is required" };

    const { data, error } = await supabase
      .from("trainers")
      .insert({ name, image_url: params.imageUrl?.trim() || null, created_by: userId })
      .select("id")
      .single();
    if (error) return { error: error.message };

    revalidatePath("/superadmin/trainers");
    return { id: data.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateTrainer(
  id: string,
  params: { name?: string; imageUrl?: string | null }
): Promise<{ error?: string }> {
  try {
    const { supabase } = await ensureSuperadmin();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (params.name != null) {
      const name = params.name.trim();
      if (!name) return { error: "Trainer name is required" };
      updates.name = name;
    }
    if (params.imageUrl !== undefined) updates.image_url = params.imageUrl?.trim() || null;

    const { error } = await supabase.from("trainers").update(updates).eq("id", id);
    if (error) return { error: error.message };

    revalidatePath("/superadmin/trainers");
    revalidatePath("/admin");
    revalidatePath("/journey");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteTrainer(id: string): Promise<{ error?: string }> {
  try {
    const { supabase } = await ensureSuperadmin();
    const { error } = await supabase.from("trainers").delete().eq("id", id);
    if (error) return { error: error.message };

    revalidatePath("/superadmin/trainers");
    revalidatePath("/admin");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Prepares a direct browser-to-storage upload for a trainer photo: the file's
 * bytes never pass through our server. Mirrors createSignedVideoUploadUrl. */
export async function createSignedTrainerImageUploadUrl(fileExtension: string): Promise<{
  error?: string;
  path?: string;
  token?: string;
  publicUrl?: string;
}> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const safeExt = fileExtension.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5).toLowerCase() || "png";
    const path = `${crypto.randomUUID()}.${safeExt}`;

    const { data, error } = await admin.storage.from(TRAINER_IMAGES_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { error: error?.message ?? "Failed to prepare trainer photo upload" };

    const { data: publicUrlData } = admin.storage.from(TRAINER_IMAGES_BUCKET).getPublicUrl(path);
    return { path, token: data.token, publicUrl: publicUrlData.publicUrl };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to prepare trainer photo upload" };
  }
}
