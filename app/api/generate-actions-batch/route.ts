import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDraftActions, draftsToActionRows, assignScheduledBatch } from "@/lib/personal-action-generation";

/**
 * Background worker for filling a user's full multi-week action plan.
 * Generates one batch via Gemini and inserts it straight into the `actions`
 * table (is_personal = true) so it shows up in the Full Action Library
 * immediately, then re-triggers itself for the next batch until the job's
 * total_needed is reached. Runs as a chain of short-lived requests instead of
 * one long call so it isn't bound by a single serverless function's time limit.
 *
 * Auth: same optional Authorization: Bearer <CRON_SECRET> pattern as
 * app/api/cron/email-scheduler/route.ts, since this route is only ever
 * triggered server-to-server (never directly by a browser).
 */
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const authHeader = request.headers.get("authorization");
    const bearerToken = authHeader?.replace("Bearer ", "");
    if (bearerToken !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let jobId: string | undefined;
  try {
    const body = await request.json();
    jobId = body?.jobId;
  } catch {
    // ignore
  }
  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: job } = await admin
    .from("personal_action_generation_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (!job || job.status !== "generating") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const remaining = job.total_needed - job.total_generated;
  const count = Math.min(job.batch_size ?? 12, remaining);
  const nowIso = new Date().toISOString();

  if (count <= 0) {
    await admin
      .from("personal_action_generation_jobs")
      .update({ status: "completed", updated_at: nowIso })
      .eq("id", jobId);
    return NextResponse.json({ ok: true, done: true });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("company_id")
    .eq("id", job.user_id)
    .single();
  const companyId = profile?.company_id;
  if (!companyId) {
    await admin
      .from("personal_action_generation_jobs")
      .update({ status: "failed", error_message: "User has no company", updated_at: nowIso })
      .eq("id", jobId);
    return NextResponse.json({ ok: false, error: "User has no company" });
  }

  // Recent titles for this user, to steer Gemini away from repeats across many batches.
  const { data: recentActions } = await admin
    .from("actions")
    .select("title")
    .eq("created_by", job.user_id)
    .eq("is_personal", true)
    .order("created_at", { ascending: false })
    .limit(30);
  const avoidTitles = (recentActions ?? []).map((r) => r.title);

  const { drafts, error } = await generateDraftActions({
    trainingText: job.training_text,
    focusThemes: job.focus_themes ?? [],
    count,
    avoidTitles,
  });

  if (error || !drafts?.length) {
    await admin
      .from("personal_action_generation_jobs")
      .update({ status: "failed", error_message: error ?? "No drafts generated", updated_at: nowIso })
      .eq("id", jobId);
    return NextResponse.json({ ok: false, error });
  }

  const rows = draftsToActionRows(drafts, companyId, job.user_id);
  await admin.from("actions").insert(rows);

  const totalGenerated = job.total_generated + drafts.length;
  const isDone = totalGenerated >= job.total_needed;

  await admin
    .from("personal_action_generation_jobs")
    .update({
      total_generated: totalGenerated,
      status: isDone ? "completed" : "generating",
      updated_at: nowIso,
    })
    .eq("id", jobId);

  // Bootstrap "My Actions" as soon as enough actions exist for the very first
  // delivery — after that, only the daily/weekly cron (assignScheduledBatch)
  // paces further deliveries, so completing an action mid-cycle never pulls
  // in a replacement early.
  const { data: sub } = await admin
    .from("personal_action_subscriptions")
    .select("id, user_id, track, day_of_week, days_of_week, daily_action_count, time_of_day_utc, next_delivery_at, last_delivered_at, is_active")
    .eq("user_id", job.user_id)
    .maybeSingle();
  if (sub && sub.is_active && !sub.last_delivered_at) {
    await assignScheduledBatch(sub);
  }

  if (!isDone) {
    const origin = new URL(request.url).origin;
    after(async () => {
      try {
        const res = await fetch(`${origin}/api/generate-actions-batch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(expected ? { Authorization: `Bearer ${expected}` } : {}),
          },
          body: JSON.stringify({ jobId }),
        });
        if (!res.ok) {
          await admin
            .from("personal_action_generation_jobs")
            .update({ status: "failed", error_message: `Next batch trigger failed (HTTP ${res.status})`, updated_at: new Date().toISOString() })
            .eq("id", jobId);
        }
      } catch (e) {
        await admin
          .from("personal_action_generation_jobs")
          .update({
            status: "failed",
            error_message: `Next batch trigger failed: ${e instanceof Error ? e.message : String(e)}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      }
    });
  }

  return NextResponse.json({ ok: true, generated: drafts.length, totalGenerated, done: isDone });
}
