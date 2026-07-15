"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PrepareContentItem, PrepareContentType } from "@/lib/types";

const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || "admin@actionengine").toLowerCase();

async function ensureSuperadmin() {
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

  const { data: profile } = await supabase.from("profiles").select("role, company_id").eq("id", user.id).single();
  const role = profile?.role ?? "user";
  if (role !== "admin" && role !== "superadmin") throw new Error("Forbidden: admin or superadmin only");

  return { supabase, userId: user.id, companyId: profile?.company_id ?? null, role };
}

type QuizQuestionInput = { questionText: string; options: { optionText: string; isCorrect: boolean }[] };

export async function createVideoContentItem(params: {
  title: string;
  description?: string;
  videoUrl: string;
  videoDurationSeconds?: number;
}): Promise<{ error?: string; id?: string }> {
  try {
    const { supabase, userId } = await ensureSuperadmin();
    const { data, error } = await supabase
      .from("prepare_content_items")
      .insert({
        created_by: userId,
        type: "video",
        title: params.title.trim(),
        description: params.description?.trim() || null,
        video_url: params.videoUrl.trim(),
        video_duration_seconds: params.videoDurationSeconds ?? null,
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

export async function createPrereadContentItem(params: {
  title: string;
  description?: string;
  prereadUrl?: string;
  prereadBody?: string;
}): Promise<{ error?: string; id?: string }> {
  try {
    const { supabase, userId } = await ensureSuperadmin();
    const { data, error } = await supabase
      .from("prepare_content_items")
      .insert({
        created_by: userId,
        type: "preread",
        title: params.title.trim(),
        description: params.description?.trim() || null,
        preread_url: params.prereadUrl?.trim() || null,
        preread_body: params.prereadBody?.trim() || null,
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

export async function createQuizContentItem(params: {
  title: string;
  description?: string;
  questions: QuizQuestionInput[];
}): Promise<{ error?: string; id?: string }> {
  try {
    const { supabase, userId } = await ensureSuperadmin();
    if (!params.questions.length) return { error: "Quiz needs at least one question" };
    for (const q of params.questions) {
      if (!q.options.some((o) => o.isCorrect)) {
        return { error: `Question "${q.questionText}" needs at least one correct option` };
      }
    }

    const { data: item, error: itemErr } = await supabase
      .from("prepare_content_items")
      .insert({
        created_by: userId,
        type: "quiz",
        title: params.title.trim(),
        description: params.description?.trim() || null,
      })
      .select("id")
      .single();
    if (itemErr) return { error: itemErr.message };

    for (let qi = 0; qi < params.questions.length; qi++) {
      const q = params.questions[qi];
      const { data: question, error: qErr } = await supabase
        .from("quiz_questions")
        .insert({ content_item_id: item.id, question_text: q.questionText.trim(), sort_order: qi })
        .select("id")
        .single();
      if (qErr) return { error: qErr.message };

      const optionRows = q.options.map((o, oi) => ({
        question_id: question.id,
        option_text: o.optionText.trim(),
        is_correct: o.isCorrect,
        sort_order: oi,
      }));
      const { error: oErr } = await supabase.from("quiz_options").insert(optionRows);
      if (oErr) return { error: oErr.message };
    }

    revalidatePath("/superadmin");
    return { id: item.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateContentItem(
  id: string,
  params: { title?: string; description?: string; isActive?: boolean; videoUrl?: string; prereadUrl?: string; prereadBody?: string }
): Promise<{ error?: string }> {
  try {
    const { supabase } = await ensureSuperadmin();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (params.title != null) updates.title = params.title.trim();
    if (params.description != null) updates.description = params.description.trim() || null;
    if (params.isActive != null) updates.is_active = params.isActive;
    if (params.videoUrl != null) updates.video_url = params.videoUrl.trim();
    if (params.prereadUrl != null) updates.preread_url = params.prereadUrl.trim() || null;
    if (params.prereadBody != null) updates.preread_body = params.prereadBody.trim() || null;

    const { error } = await supabase.from("prepare_content_items").update(updates).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/superadmin");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function archiveContentItem(id: string): Promise<{ error?: string }> {
  try {
    const { supabase } = await ensureSuperadmin();
    const { error } = await supabase.from("prepare_content_items").update({ is_active: false }).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/superadmin");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteContentItem(id: string): Promise<{ error?: string }> {
  try {
    const { supabase } = await ensureSuperadmin();

    const { data: inUse } = await supabase
      .from("cohort_prepare_assignments")
      .select("id")
      .eq("content_item_id", id)
      .limit(1)
      .maybeSingle();
    if (inUse) return { error: "Cannot delete: item is assigned to a cohort. Archive it instead." };

    const { error } = await supabase.from("prepare_content_items").delete().eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/superadmin");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function listContentItems(type?: PrepareContentType): Promise<{
  error?: string;
  items?: PrepareContentItem[];
}> {
  try {
    const { supabase } = await ensureSuperadmin();
    let query = supabase
      .from("prepare_content_items")
      .select("id, type, title, description, is_active, video_url, video_duration_seconds, preread_url, preread_body")
      .order("created_at", { ascending: false });
    if (type) query = query.eq("type", type);
    const { data, error } = await query;
    if (error) return { error: error.message };

    return {
      items: (data ?? []).map((row) => ({
        id: row.id,
        type: row.type as PrepareContentType,
        title: row.title,
        description: row.description,
        isActive: row.is_active,
        videoUrl: row.video_url,
        videoDurationSeconds: row.video_duration_seconds,
        prereadUrl: row.preread_url,
        prereadBody: row.preread_body,
      })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function getContentItemDetail(id: string): Promise<{ error?: string; item?: PrepareContentItem }> {
  try {
    const { supabase } = await ensureSuperadmin();
    const { data: row, error } = await supabase
      .from("prepare_content_items")
      .select("id, type, title, description, is_active, video_url, video_duration_seconds, preread_url, preread_body")
      .eq("id", id)
      .single();
    if (error || !row) return { error: error?.message ?? "Not found" };

    let questions: PrepareContentItem["questions"];
    if (row.type === "quiz") {
      const { data: qRows } = await supabase
        .from("quiz_questions")
        .select("id, question_text, sort_order, quiz_options(id, option_text, is_correct, sort_order)")
        .eq("content_item_id", id)
        .order("sort_order");
      questions = (qRows ?? []).map((q) => ({
        id: q.id,
        questionText: q.question_text,
        options: ((q.quiz_options ?? []) as { id: string; option_text: string; is_correct: boolean; sort_order: number }[])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((o) => ({ id: o.id, optionText: o.option_text, isCorrect: o.is_correct })),
      }));
    }

    return {
      item: {
        id: row.id,
        type: row.type as PrepareContentType,
        title: row.title,
        description: row.description,
        isActive: row.is_active,
        videoUrl: row.video_url,
        videoDurationSeconds: row.video_duration_seconds,
        prereadUrl: row.preread_url,
        prereadBody: row.preread_body,
        questions,
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Active library items, readable by any authenticated user (RLS already allows this) —
 * used by company admins to pick items to attach to their own cohort, without needing
 * superadmin authoring access. */
export async function listActiveLibraryItems(): Promise<{ error?: string; items?: PrepareContentItem[] }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data, error } = await supabase
      .from("prepare_content_items")
      .select("id, type, title, description, is_active, video_url, video_duration_seconds, preread_url, preread_body")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) return { error: error.message };

    return {
      items: (data ?? []).map((row) => ({
        id: row.id,
        type: row.type as PrepareContentType,
        title: row.title,
        description: row.description,
        isActive: row.is_active,
        videoUrl: row.video_url,
        videoDurationSeconds: row.video_duration_seconds,
        prereadUrl: row.preread_url,
        prereadBody: row.preread_body,
      })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function assignContentToCohort(cohortId: string, contentItemIds: string[]): Promise<{ error?: string }> {
  try {
    const { supabase, companyId: myCompanyId, role, userId } = await getAdminContext();

    const { data: cohort } = await supabase.from("cohorts").select("company_id").eq("id", cohortId).single();
    if (!cohort) return { error: "Cohort not found" };
    if (role === "admin" && cohort.company_id !== myCompanyId) return { error: "Access denied" };

    for (const contentItemId of contentItemIds) {
      const { error } = await supabase
        .from("cohort_prepare_assignments")
        .upsert(
          { cohort_id: cohortId, content_item_id: contentItemId, assigned_by: userId },
          { onConflict: "cohort_id,content_item_id" }
        );
      if (error) return { error: error.message };
    }
    revalidatePath("/admin");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function removeContentFromCohort(cohortId: string, contentItemId: string): Promise<{ error?: string }> {
  try {
    const { supabase, companyId: myCompanyId, role } = await getAdminContext();

    const { data: cohort } = await supabase.from("cohorts").select("company_id").eq("id", cohortId).single();
    if (!cohort) return { error: "Cohort not found" };
    if (role === "admin" && cohort.company_id !== myCompanyId) return { error: "Access denied" };

    const { error } = await supabase
      .from("cohort_prepare_assignments")
      .delete()
      .eq("cohort_id", cohortId)
      .eq("content_item_id", contentItemId);
    if (error) return { error: error.message };
    revalidatePath("/admin");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Content assigned to a cohort — read-only, used by both the admin Cohort screen and the user Prepare page. */
export async function listCohortContent(cohortId: string): Promise<{ error?: string; items?: PrepareContentItem[] }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: assignments } = await supabase
      .from("cohort_prepare_assignments")
      .select("content_item_id, sort_order")
      .eq("cohort_id", cohortId)
      .order("sort_order");
    if (!assignments?.length) return { items: [] };

    const ids = assignments.map((a: { content_item_id: string }) => a.content_item_id);
    const { data: rows, error } = await supabase
      .from("prepare_content_items")
      .select("id, type, title, description, is_active, video_url, video_duration_seconds, preread_url, preread_body")
      .in("id", ids)
      .eq("is_active", true);
    if (error) return { error: error.message };

    const order = new Map(ids.map((id: string, i: number) => [id, i]));
    const items = (rows ?? [])
      .slice()
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map((row) => ({
        id: row.id,
        type: row.type as PrepareContentType,
        title: row.title,
        description: row.description,
        isActive: row.is_active,
        videoUrl: row.video_url,
        videoDurationSeconds: row.video_duration_seconds,
        prereadUrl: row.preread_url,
        prereadBody: row.preread_body,
      }));
    return { items };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}
