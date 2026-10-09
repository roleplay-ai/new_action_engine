/**
 * Gives each action in a finalised plan a random Surprise Box resource
 * (supabase/migrations/081_surprise_boxes.sql, docs/SURPRISE_BOXES_PLAN.md),
 * writing actions.surprise_resource_id. No LLM: resources are spread so a plan
 * sees each one before any repeats (assignRandomResources). Never throws into
 * its caller; if it fails, unlock_my_surprise_box() still falls back to the
 * least-used active resource at unlock time.
 */
import { assignRandomResources } from "@/lib/surprise-boxes";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

type PlanActionRow = { action_id: string; actions: { id: string; surprise_resource_id: string | null } | null };

/** One UPDATE per resource rather than per action. */
async function writeAssignments(admin: AdminClient, assignments: Map<string, string>) {
  const byResource = new Map<string, string[]>();
  for (const [actionId, resourceId] of assignments) {
    byResource.set(resourceId, [...(byResource.get(resourceId) ?? []), actionId]);
  }
  const results = await Promise.all(
    [...byResource].map(([resourceId, actionIds]) =>
      admin.from("actions").update({ surprise_resource_id: resourceId }).in("id", actionIds)
    )
  );
  for (const { error } of results) {
    if (error) console.error("[surprise-resource-assignment] failed to save assignments", error.message);
  }
}

/**
 * Assigns every action frozen into the user's Commitment Wallet plan for this
 * cohort. Runs after plan activation. Skips plans without Surprise Boxes
 * (finalised before launch) and actions that already have a resource.
 */
export async function assignSurpriseResourcesForPlan(
  admin: AdminClient,
  params: { userId: string; cohortId: string }
): Promise<void> {
  try {
    const { data: plan } = await admin
      .from("commitment_wallet_plans")
      .select("id, surprise_boxes_enabled")
      .eq("user_id", params.userId)
      .eq("cohort_id", params.cohortId)
      .maybeSingle();
    if (!plan?.surprise_boxes_enabled) return;

    const [{ data: rows, error }, { data: resources, error: resourcesError }] = await Promise.all([
      admin.from("commitment_wallet_actions").select("action_id, actions(id, surprise_resource_id)").eq("plan_id", plan.id),
      admin.from("surprise_box_resources").select("id").eq("is_active", true),
    ]);
    if (error || resourcesError) {
      console.error("[surprise-resource-assignment] failed to load plan or library", (error ?? resourcesError)?.message);
      return;
    }

    const planActions = ((rows ?? []) as unknown as PlanActionRow[])
      .map((row) => row.actions)
      .filter((action): action is NonNullable<PlanActionRow["actions"]> => !!action);

    const usage = new Map<string, number>();
    for (const action of planActions) {
      if (action.surprise_resource_id) usage.set(action.surprise_resource_id, (usage.get(action.surprise_resource_id) ?? 0) + 1);
    }
    const unassigned = planActions.filter((action) => !action.surprise_resource_id).map((action) => action.id);
    if (!unassigned.length || !resources?.length) return;

    await writeAssignments(admin, assignRandomResources(unassigned, resources.map((resource) => resource.id), usage));
  } catch (e) {
    console.error("[surprise-resource-assignment] plan assignment failed", e instanceof Error ? e.message : e);
  }
}
