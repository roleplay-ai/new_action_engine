"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserPrepareProgress } from "@/lib/types";
import { getMyCohort } from "@/app/actions/cohorts";

/** Assigned Prepare items for the given cohort + this user's per-item status/completion. */
export async function getMyPrepareProgress(cohortId: string): Promise<{
  error?: string;
  progress?: UserPrepareProgress[];
  completedCount?: number;
  totalCount?: number;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { cohort: selectedCohort } = await getMyCohort();
    if (selectedCohort?.id !== cohortId) return { error: "Select this cohort before viewing its progress" };

    // Confirm the caller is actually a member of this cohort before returning anything.
    const { data: membership } = await supabase
      .from("cohort_members")
      .select("cohort_id")
      .eq("cohort_id", cohortId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) return { error: "Not a member of this cohort" };

    const { data: assignments } = await supabase
      .from("cohort_prepare_assignments")
      .select("content_item_id")
      .eq("cohort_id", cohortId);
    const contentItemIds = (assignments ?? []).map((a: { content_item_id: string }) => a.content_item_id);
    if (!contentItemIds.length) return { progress: [], completedCount: 0, totalCount: 0 };

    const { data: progressRows } = await supabase
      .from("user_prepare_progress")
      .select("content_item_id, status, completed_at")
      .eq("user_id", user.id)
      .eq("cohort_id", cohortId);
    const byItem = new Map(
      (progressRows ?? []).map((r: { content_item_id: string; status: string; completed_at: string | null }) => [
        r.content_item_id,
        r,
      ])
    );

    const { data: attempts } = await supabase
      .from("user_quiz_attempts")
      .select("content_item_id, score, total_questions, completed_at")
      .eq("user_id", user.id)
      .eq("cohort_id", cohortId)
      .order("completed_at", { ascending: false });
    const lastAttemptByItem = new Map<string, { score: number; total_questions: number }>();
    for (const a of (attempts ?? []) as { content_item_id: string; score: number; total_questions: number }[]) {
      if (!lastAttemptByItem.has(a.content_item_id)) lastAttemptByItem.set(a.content_item_id, a);
    }

    const progress: UserPrepareProgress[] = contentItemIds.map((id) => {
      const row = byItem.get(id) as { status: string; completed_at: string | null } | undefined;
      const attempt = lastAttemptByItem.get(id);
      return {
        contentItemId: id,
        status: (row?.status as UserPrepareProgress["status"]) ?? "not_started",
        completedAt: row?.completed_at ?? null,
        lastScore: attempt?.score ?? null,
        lastTotalQuestions: attempt?.total_questions ?? null,
      };
    });

    const completedCount = progress.filter((p) => p.status === "completed").length;
    return { progress, completedCount, totalCount: contentItemIds.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Marks a video/pre-read item as viewed/completed. Validates the item is actually assigned to a cohort the caller belongs to. */
export async function markContentViewed(contentItemId: string): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { cohort } = await getMyCohort();
    if (!cohort) return { error: "Select a cohort first" };

    const { data: assignment } = await supabase
      .from("cohort_prepare_assignments")
      .select("cohort_id")
      .eq("content_item_id", contentItemId)
      .eq("cohort_id", cohort.id)
      .maybeSingle();
    if (!assignment) return { error: "Content not assigned to your cohort" };

    const { error } = await supabase.from("user_prepare_progress").upsert(
      {
        user_id: user.id,
        content_item_id: contentItemId,
        cohort_id: assignment.cohort_id,
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,content_item_id,cohort_id" }
    );
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Returns quiz questions/options for the caller to attempt, with is_correct stripped —
 * this is the security boundary that keeps answer keys out of the browser. Uses the
 * service-role client since quiz_questions/quiz_options RLS is superadmin-only. */
export async function getQuizForAttempt(contentItemId: string): Promise<{
  error?: string;
  title?: string;
  questions?: { id: string; questionText: string; options: { id: string; optionText: string }[] }[];
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { cohort } = await getMyCohort();
    if (!cohort) return { error: "Select a cohort first" };

    const { data: assignment } = await supabase
      .from("cohort_prepare_assignments")
      .select("cohort_id")
      .eq("content_item_id", contentItemId)
      .eq("cohort_id", cohort.id)
      .maybeSingle();
    if (!assignment) return { error: "Quiz not assigned to your cohort" };

    const admin = createAdminClient();
    const { data: item } = await admin
      .from("prepare_content_items")
      .select("title, type")
      .eq("id", contentItemId)
      .single();
    if (!item || item.type !== "quiz") return { error: "Not a quiz" };

    const { data: qRows } = await admin
      .from("quiz_questions")
      .select("id, question_text, sort_order, quiz_options(id, option_text, sort_order)")
      .eq("content_item_id", contentItemId)
      .order("sort_order");

    const questions = (qRows ?? []).map((q) => ({
      id: q.id,
      questionText: q.question_text,
      options: ((q.quiz_options ?? []) as { id: string; option_text: string; sort_order: number }[])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((o) => ({ id: o.id, optionText: o.option_text })),
    }));

    return { title: item.title, questions };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Server-side scoring: answers is a map of questionId -> selected optionId. */
export async function submitQuizAttempt(
  contentItemId: string,
  answers: Record<string, string>
): Promise<{ error?: string; score?: number; totalQuestions?: number }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { cohort } = await getMyCohort();
    if (!cohort) return { error: "Select a cohort first" };

    const { data: assignment } = await supabase
      .from("cohort_prepare_assignments")
      .select("cohort_id")
      .eq("content_item_id", contentItemId)
      .eq("cohort_id", cohort.id)
      .maybeSingle();
    if (!assignment) return { error: "Quiz not assigned to your cohort" };

    const admin = createAdminClient();
    const { data: qRows } = await admin
      .from("quiz_questions")
      .select("id, quiz_options(id, is_correct)")
      .eq("content_item_id", contentItemId);
    if (!qRows?.length) return { error: "Quiz has no questions" };

    let score = 0;
    for (const q of qRows as { id: string; quiz_options: { id: string; is_correct: boolean }[] }[]) {
      const selectedOptionId = answers[q.id];
      const correctOption = q.quiz_options.find((o) => o.is_correct);
      if (selectedOptionId && correctOption && selectedOptionId === correctOption.id) score++;
    }
    const totalQuestions = qRows.length;

    const { error: attemptErr } = await supabase.from("user_quiz_attempts").insert({
      user_id: user.id,
      content_item_id: contentItemId,
      cohort_id: assignment.cohort_id,
      score,
      total_questions: totalQuestions,
      answers,
    });
    if (attemptErr) return { error: attemptErr.message };

    const { error: progressErr } = await supabase.from("user_prepare_progress").upsert(
      {
        user_id: user.id,
        content_item_id: contentItemId,
        cohort_id: assignment.cohort_id,
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,content_item_id,cohort_id" }
    );
    if (progressErr) return { error: progressErr.message };

    return { score, totalQuestions };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}
