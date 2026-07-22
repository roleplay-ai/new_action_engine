import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ArchivedSubscriptionRow = {
  cohort_id: string | null;
  archived_at: string;
};

type ArchivedActionRow = {
  id: string;
  cohort_id: string | null;
  theme: string;
  title: string;
  how: string;
  why: string;
  time_estimate: string | null;
  created_at: string;
};

type ArchivedUserActionRow = {
  action_id: string;
  status: string | null;
  reflection: string | null;
  scheduled_at: string | null;
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated", actions: [] }, { status: 401 });
  }

  const { data: subscriptions, error: subscriptionError } = await supabase
    .from("personal_action_subscriptions")
    .select("cohort_id, archived_at")
    .eq("user_id", user.id)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  if (subscriptionError) {
    return NextResponse.json(
      { error: subscriptionError.message, actions: [] },
      { status: 500, headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }

  const archivedSubscriptions = (subscriptions ?? []) as ArchivedSubscriptionRow[];
  const cohortIds = [...new Set(archivedSubscriptions.map((row) => row.cohort_id).filter((id): id is string => !!id))];
  if (!cohortIds.length) {
    return NextResponse.json(
      { actions: [] },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }

  const [{ data: actionRows, error: actionsError }, { data: userActionRows, error: userActionsError }, { data: cohortRows, error: cohortsError }] = await Promise.all([
    supabase
      .from("actions")
      .select("id, cohort_id, theme, title, how, why, time_estimate, created_at")
      .eq("created_by", user.id)
      .eq("is_personal", true)
      .in("cohort_id", cohortIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("user_actions")
      .select("action_id, status, reflection, scheduled_at")
      .eq("user_id", user.id)
      .in("cohort_id", cohortIds),
    supabase
      .from("cohorts")
      .select("id, name")
      .in("id", cohortIds),
  ]);

  const queryError = actionsError ?? userActionsError ?? cohortsError;
  if (queryError) {
    return NextResponse.json(
      { error: queryError.message, actions: [] },
      { status: 500, headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }

  const archivedAtByCohort = new Map(archivedSubscriptions.map((row) => [row.cohort_id, row.archived_at]));
  const cohortNameById = new Map((cohortRows ?? []).map((row) => [row.id, row.name]));
  const userActionByActionId = new Map(
    ((userActionRows ?? []) as ArchivedUserActionRow[]).map((row) => [row.action_id, row])
  );

  const actions = ((actionRows ?? []) as ArchivedActionRow[])
    .filter((row): row is ArchivedActionRow & { cohort_id: string } => !!row.cohort_id)
    .map((row) => {
      const userAction = userActionByActionId.get(row.id);
      return {
        id: row.id,
        cohortId: row.cohort_id,
        cohortName: cohortNameById.get(row.cohort_id) ?? "Earlier cohort",
        archivedAt: archivedAtByCohort.get(row.cohort_id) ?? row.created_at,
        theme: row.theme,
        title: row.title,
        how: row.how,
        why: row.why,
        timeEstimate: row.time_estimate ?? "5 mins",
        status: userAction?.status ?? null,
        reflection: userAction?.reflection ?? null,
        scheduledAt: userAction?.scheduled_at ?? null,
      };
    })
    .sort((left, right) => {
      const cohortOrder = new Date(right.archivedAt).getTime() - new Date(left.archivedAt).getTime();
      return cohortOrder || left.title.localeCompare(right.title);
    });

  return NextResponse.json(
    { actions },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}
