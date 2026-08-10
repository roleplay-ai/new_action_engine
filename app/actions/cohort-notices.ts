"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CohortNotice } from "@/lib/types";

/** Shared access check: who can see/post to a cohort's notice board.
 * Mirrors getChatAccess in app/actions/cohort-chat.ts — a participant in the
 * cohort, the cohort's company admin/superadmin, or the cohort's own trainer. */
async function getNoticeBoardAccess(cohortId: string): Promise<
  | { supabase: Awaited<ReturnType<typeof createClient>>; userId: string; canPost: boolean }
  | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase.from("profiles").select("role, company_id").eq("id", user.id).single();
  if (!profile) return { error: "Profile not found" };

  if (profile.role === "trainer") {
    const { data: cohort } = await supabase.from("cohorts").select("id").eq("id", cohortId).maybeSingle();
    if (cohort) return { supabase, userId: user.id, canPost: true };
    return { error: "You do not run this batch" };
  }

  if (profile.role === "admin" || profile.role === "superadmin") {
    const { data: cohort } = await supabase.from("cohorts").select("company_id").eq("id", cohortId).maybeSingle();
    const canManage = profile.role === "superadmin" || (!!cohort && cohort.company_id === profile.company_id);
    if (canManage) return { supabase, userId: user.id, canPost: true };
    return { error: "You do not have access to this batch" };
  }

  const { data: membership } = await supabase
    .from("cohort_members")
    .select("id")
    .eq("cohort_id", cohortId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership) return { supabase, userId: user.id, canPost: false };

  return { error: "You do not have access to this batch" };
}

/** The notice board for a cohort, newest first — readable by members, the
 * cohort's trainer, and admin/superadmin. */
export async function getCohortNotices(cohortId: string): Promise<{ error?: string; notices?: CohortNotice[] }> {
  try {
    const access = await getNoticeBoardAccess(cohortId);
    if ("error" in access) return { error: access.error };

    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from("cohort_notices")
      .select("id, cohort_id, created_by, message, created_at")
      .eq("cohort_id", cohortId)
      .order("created_at", { ascending: false });
    if (error) return { error: error.message };

    const authorIds = [...new Set((rows ?? []).map((row) => row.created_by))];
    const [{ data: authors }, { data: trainerRows }] = await Promise.all([
      authorIds.length ? admin.from("profiles").select("id, full_name").in("id", authorIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
      authorIds.length ? admin.from("trainers").select("user_id, image_url").in("user_id", authorIds) : Promise.resolve({ data: [] as { user_id: string | null; image_url: string | null }[] }),
    ]);
    const authorMap = new Map((authors ?? []).map((author) => [author.id, author.full_name]));
    const trainerImageMap = new Map((trainerRows ?? []).filter((row) => row.user_id).map((row) => [row.user_id as string, row.image_url]));

    return {
      notices: (rows ?? []).map((row) => ({
        id: row.id,
        cohortId: row.cohort_id,
        message: row.message,
        createdAt: row.created_at,
        authorName: authorMap.get(row.created_by)?.trim() || "Trainer",
        authorImageUrl: trainerImageMap.get(row.created_by) ?? null,
      })),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not load the notice board" };
  }
}

/** Post a new notice. Trainer of the cohort, or an admin/superadmin standing
 * in, only — never participants. */
export async function postCohortNotice(cohortId: string, message: string): Promise<{ error?: string; notice?: CohortNotice }> {
  try {
    const access = await getNoticeBoardAccess(cohortId);
    if ("error" in access) return { error: access.error };
    if (!access.canPost) return { error: "Only the trainer can post to the notice board" };

    const cleanMessage = message.trim();
    if (!cleanMessage) return { error: "Write something before posting" };
    if (cleanMessage.length > 2000) return { error: "Notices can be up to 2,000 characters" };

    const { data: row, error } = await access.supabase
      .from("cohort_notices")
      .insert({ cohort_id: cohortId, created_by: access.userId, message: cleanMessage })
      .select("id, cohort_id, message, created_at")
      .single();
    if (error) return { error: error.message };
    if (!row) return { error: "The notice was posted but could not be displayed" };

    const [{ data: authorProfile }, { data: trainerRow }] = await Promise.all([
      access.supabase.from("profiles").select("full_name").eq("id", access.userId).single(),
      access.supabase.from("trainers").select("image_url").eq("user_id", access.userId).maybeSingle(),
    ]);

    revalidatePath("/journey");
    revalidatePath("/trainer/notices");
    return {
      notice: {
        id: row.id,
        cohortId: row.cohort_id,
        message: row.message,
        createdAt: row.created_at,
        authorName: authorProfile?.full_name?.trim() || "Trainer",
        authorImageUrl: trainerRow?.image_url ?? null,
      },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not post the notice" };
  }
}

/** Remove a notice: its author, or a superadmin. */
export async function deleteCohortNotice(noticeId: string): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { error } = await supabase.from("cohort_notices").delete().eq("id", noticeId);
    if (error) return { error: error.message };

    revalidatePath("/journey");
    revalidatePath("/trainer/notices");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not remove the notice" };
  }
}
