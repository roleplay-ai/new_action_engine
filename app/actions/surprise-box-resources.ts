"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SURPRISE_BOX_BUCKET,
  surpriseUploadExtension,
  validateSurpriseResourceInput,
  youtubeThumbnailUrl,
  type SurpriseResource,
  type SurpriseResourceInput,
  type SurpriseUploadPurpose,
} from "@/lib/surprise-boxes";

const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || "admin@actionengine").toLowerCase();
const PAGE_PATH = "/superadmin/surprise-boxes";

/** The Surprise Box library is superadmin-only (not company admins). */
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

type ResourceRow = {
  id: string;
  title: string;
  description: string;
  kind: SurpriseResource["kind"];
  source: SurpriseResource["source"];
  storage_path: string | null;
  external_url: string | null;
  thumbnail_path: string | null;
  duration_label: string | null;
  is_active: boolean;
  created_at: string;
};

const PAGE_SIZE = 1000;

/**
 * Counts rows per value of `column`, paging past PostgREST's per-request row
 * cap so totals stay right as the number of mapped actions grows.
 */
async function countByColumn(
  admin: ReturnType<typeof createAdminClient>,
  table: "actions" | "surprise_box_unlocks",
  column: "surprise_resource_id" | "resource_id"
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from(table)
      .select(column)
      .not(column, "is", null)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`[surprise-box-resources] failed counting ${table}.${column}`, error.message);
      return counts;
    }
    for (const row of (data ?? []) as Record<string, string | null>[]) {
      const key = row[column];
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (!data || data.length < PAGE_SIZE) return counts;
  }
}

/** Every library resource, newest first, with public URLs and usage counts. */
export async function listSurpriseResources(): Promise<{ resources?: SurpriseResource[]; error?: string }> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const [resourcesResult, mapped, unlocked] = await Promise.all([
      admin.from("surprise_box_resources").select("*").order("created_at", { ascending: false }),
      countByColumn(admin, "actions", "surprise_resource_id"),
      countByColumn(admin, "surprise_box_unlocks", "resource_id"),
    ]);
    if (resourcesResult.error) return { error: resourcesResult.error.message };

    const bucket = admin.storage.from(SURPRISE_BOX_BUCKET);

    const resources = ((resourcesResult.data ?? []) as ResourceRow[]).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      kind: row.kind,
      source: row.source,
      storagePath: row.storage_path,
      externalUrl: row.external_url,
      thumbnailPath: row.thumbnail_path,
      durationLabel: row.duration_label,
      isActive: row.is_active,
      createdAt: row.created_at,
      url: row.storage_path ? bucket.getPublicUrl(row.storage_path).data.publicUrl : row.external_url ?? "",
      thumbnailUrl: row.thumbnail_path ? bucket.getPublicUrl(row.thumbnail_path).data.publicUrl : youtubeThumbnailUrl(row.external_url),
      mappedActionCount: mapped.get(row.id) ?? 0,
      unlockCount: unlocked.get(row.id) ?? 0,
    }));
    return { resources };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to load the Surprise Box library" };
  }
}

/**
 * Prepares a direct browser-to-storage upload into the surprise-box-resources
 * bucket, so large videos never pass through a Server Action body.
 */
export async function createSignedSurpriseUploadUrl(
  purpose: SurpriseUploadPurpose,
  mimeType: string
): Promise<{ error?: string; path?: string; token?: string }> {
  try {
    await ensureSuperadmin();
    const extension = surpriseUploadExtension(purpose, mimeType);
    if (!extension) {
      return {
        error:
          purpose === "video"
            ? "Use an MP4, WebM or MOV video."
            : purpose === "resource"
              ? "Use a PDF."
              : "Use a PNG, JPG, WebP or GIF image.",
      };
    }

    const folder = purpose === "thumbnail" ? "thumbnails" : "resources";
    const path = `${folder}/${crypto.randomUUID()}.${extension}`;
    const { data, error } = await createAdminClient().storage.from(SURPRISE_BOX_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { error: error?.message ?? "Failed to prepare upload" };
    return { path, token: data.token };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to prepare upload" };
  }
}

function toRow(value: Required<SurpriseResourceInput>) {
  return {
    title: value.title,
    description: value.description,
    kind: value.kind,
    source: value.source,
    storage_path: value.storagePath,
    external_url: value.externalUrl,
    thumbnail_path: value.thumbnailPath,
    duration_label: value.durationLabel,
  };
}

/** Best-effort cleanup of bucket files that are no longer referenced. */
async function removeStoredFiles(paths: (string | null | undefined)[]) {
  const toRemove = paths.filter((path): path is string => !!path);
  if (!toRemove.length) return;
  const { error } = await createAdminClient().storage.from(SURPRISE_BOX_BUCKET).remove(toRemove);
  if (error) console.error("[surprise-box-resources] failed to remove stored files", error.message);
}

export async function createSurpriseResource(input: SurpriseResourceInput): Promise<{ error?: string; id?: string }> {
  try {
    const { userId } = await ensureSuperadmin();
    const validated = validateSurpriseResourceInput(input);
    if ("error" in validated) return { error: validated.error };

    const { data, error } = await createAdminClient()
      .from("surprise_box_resources")
      .insert({ ...toRow(validated.value), created_by: userId })
      .select("id")
      .single();
    if (error) return { error: error.message };

    revalidatePath(PAGE_PATH);
    return { id: data.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create resource" };
  }
}

export async function updateSurpriseResource(id: string, input: SurpriseResourceInput): Promise<{ error?: string }> {
  try {
    await ensureSuperadmin();
    const validated = validateSurpriseResourceInput(input);
    if ("error" in validated) return { error: validated.error };

    const admin = createAdminClient();
    const { data: existing, error: loadError } = await admin
      .from("surprise_box_resources")
      .select("storage_path, thumbnail_path")
      .eq("id", id)
      .single();
    if (loadError || !existing) return { error: loadError?.message ?? "Resource not found" };

    const { error } = await admin
      .from("surprise_box_resources")
      .update({ ...toRow(validated.value), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };

    // Files replaced or dropped by this edit are no longer referenced anywhere.
    await removeStoredFiles([
      existing.storage_path !== validated.value.storagePath ? existing.storage_path : null,
      existing.thumbnail_path !== validated.value.thumbnailPath ? existing.thumbnail_path : null,
    ]);

    revalidatePath(PAGE_PATH);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update resource" };
  }
}

/** Inactive resources are skipped by the matcher and the unlock fallback; boxes already unlocked keep them. */
export async function setSurpriseResourceActive(id: string, isActive: boolean): Promise<{ error?: string }> {
  try {
    await ensureSuperadmin();
    const { error } = await createAdminClient()
      .from("surprise_box_resources")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };
    revalidatePath(PAGE_PATH);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update resource" };
  }
}

/** Deletes a resource that has never been mapped or unlocked; anything in use must be deactivated instead. */
export async function deleteSurpriseResource(id: string): Promise<{ error?: string }> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const [mapped, unlocked] = await Promise.all([
      admin.from("actions").select("id", { count: "exact", head: true }).eq("surprise_resource_id", id),
      admin.from("surprise_box_unlocks").select("id", { count: "exact", head: true }).eq("resource_id", id),
    ]);
    if ((mapped.count ?? 0) > 0 || (unlocked.count ?? 0) > 0) {
      return { error: "This resource is already matched to participants' actions. Deactivate it instead." };
    }

    const { data: existing } = await admin
      .from("surprise_box_resources")
      .select("storage_path, thumbnail_path")
      .eq("id", id)
      .single();

    const { error } = await admin.from("surprise_box_resources").delete().eq("id", id);
    if (error) return { error: error.message };

    await removeStoredFiles([existing?.storage_path, existing?.thumbnail_path]);
    revalidatePath(PAGE_PATH);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete resource" };
  }
}
