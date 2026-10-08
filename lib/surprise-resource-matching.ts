/**
 * Maps a finalised plan's actions to Surprise Box resources by the
 * superadmin-written descriptions (supabase/migrations/081_surprise_boxes.sql,
 * docs/SURPRISE_BOXES_PLAN.md), writing actions.surprise_resource_id.
 *
 * Modelled on lib/action-image-matching.ts: a small Gemini model picks by
 * list position, it runs in the background via next/server's `after`, and it
 * never throws into its caller. Anything the model leaves unmatched gets the
 * least-used resource, so every action ends up with one; if the whole call
 * fails, unlock_my_surprise_box() still falls back at unlock time.
 */
import { Type } from "@google/genai";
import { getGeminiClient, isGeminiConfigured, GEMINI_SURPRISE_MATCH_MODEL } from "@/lib/gemini";
import { callGeminiWithLimit, isRateLimitError } from "@/lib/gemini-limiter";
import { fillWithLeastUsed, parseResourceMatches } from "@/lib/surprise-boxes";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type ActionToMatch = { id: string; title: string; how?: string | null; why?: string | null };
export type ResourceToMatch = { id: string; title: string; description: string };

/** Actions per Gemini call; a 12-action plan is one call, larger plans are split. */
const ACTIONS_PER_CALL = 25;

const matchSchema = {
  type: Type.OBJECT,
  properties: {
    matches: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          actionIndex: { type: Type.INTEGER },
          resourceIndex: { type: Type.INTEGER },
        },
        required: ["actionIndex", "resourceIndex"],
      },
    },
  },
  required: ["matches"],
};

export function buildResourceMatchPrompt(
  actions: ActionToMatch[],
  resources: ResourceToMatch[],
  usage: Map<string, number>
): string {
  const resourceBlock = resources
    .map((resource, i) => {
      const used = usage.get(resource.id) ?? 0;
      return `${i + 1}. ${resource.title} — ${resource.description}${used ? ` [already given ${used}× in this plan]` : ""}`;
    })
    .join("\n");
  const actionBlock = actions
    .map((action, i) => `${i + 1}. ${action.title}${action.how ? ` — ${action.how}` : ""}`)
    .join("\n");

  return `A participant in a workplace training programme gets a reward each time they complete one of their planned actions: a short video or resource from a FIXED numbered library. Pick that resource for each action below.

RESOURCE LIBRARY (numbered 1-${resources.length})
${resourceBlock}

ACTIONS (numbered 1-${actions.length})
${actionBlock}

TASK
For every action number, return its actionIndex and the resourceIndex of the library resource that best helps someone who has just done that action go deeper on the same skill or situation. Match on the underlying skill or situation in each resource's description (e.g. giving feedback, listening, delegating, running meetings), not on exact wording.
Prefer variety: give each resource to at most one action while an unused resource is still a reasonable fit, and avoid resources marked as already given. Only repeat a resource when no unused one fits reasonably or there are more actions than resources.
Every action must get a resourceIndex — pick the closest available fit even if none is perfect. Return exactly one entry per action number, in any order.`;
}

async function askGemini(prompt: string): Promise<string | undefined> {
  const ai = getGeminiClient();
  const response = await callGeminiWithLimit(() =>
    ai.models.generateContent({
      model: GEMINI_SURPRISE_MATCH_MODEL,
      contents: prompt,
      config: { responseMimeType: "application/json", responseSchema: matchSchema },
    })
  );
  return response.text;
}

/**
 * Picks a resource for every action: Gemini where it answers, least-used
 * resource otherwise. `usage` counts resources already given in this plan and
 * is updated as resources are assigned. Pure apart from the Gemini call.
 */
export async function matchActionsToResources(
  actions: ActionToMatch[],
  resources: ResourceToMatch[],
  usage: Map<string, number> = new Map()
): Promise<Map<string, string>> {
  const assignments = new Map<string, string>();
  if (!actions.length || !resources.length) return assignments;

  for (let start = 0; start < actions.length; start += ACTIONS_PER_CALL) {
    const chunk = actions.slice(start, start + ACTIONS_PER_CALL);
    try {
      if (isGeminiConfigured()) {
        const text = await askGemini(buildResourceMatchPrompt(chunk, resources, usage));
        const matches = text ? parseResourceMatches(text, chunk.length, resources.length) : new Map<number, number>();
        for (const [actionIndex, resourceIndex] of matches) {
          const resourceId = resources[resourceIndex].id;
          assignments.set(chunk[actionIndex].id, resourceId);
          usage.set(resourceId, (usage.get(resourceId) ?? 0) + 1);
        }
      }
    } catch (e) {
      console.error(
        "[surprise-resource-matching]",
        isRateLimitError(e) ? "rate-limited; using least-used resources for this batch" : e instanceof Error ? e.message : e
      );
    }
    fillWithLeastUsed(chunk.map((action) => action.id), assignments, resources.map((resource) => resource.id), usage);
  }
  return assignments;
}

async function loadActiveResources(admin: AdminClient): Promise<ResourceToMatch[]> {
  const { data, error } = await admin
    .from("surprise_box_resources")
    .select("id, title, description")
    .eq("is_active", true)
    .order("created_at");
  if (error) {
    console.error("[surprise-resource-matching] failed to load library", error.message);
    return [];
  }
  return (data ?? []) as ResourceToMatch[];
}

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
    if (error) console.error("[surprise-resource-matching] failed to save matches", error.message);
  }
}

type PlanActionRow = { action_id: string; actions: (ActionToMatch & { plan_order: number | null; surprise_resource_id: string | null }) | null };

/**
 * Maps every action frozen into the user's Commitment Wallet plan for this
 * cohort. Runs after plan activation. Skips plans without Surprise Boxes
 * (finalised before launch) and actions that already have a resource.
 */
export async function matchSurpriseResourcesForPlan(
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

    const { data: rows, error } = await admin
      .from("commitment_wallet_actions")
      .select("action_id, actions(id, title, how, why, plan_order, surprise_resource_id)")
      .eq("plan_id", plan.id);
    if (error) {
      console.error("[surprise-resource-matching] failed to load plan actions", error.message);
      return;
    }

    const planActions = ((rows ?? []) as unknown as PlanActionRow[])
      .map((row) => row.actions)
      .filter((action): action is NonNullable<PlanActionRow["actions"]> => !!action)
      .sort((a, b) => (a.plan_order ?? 0) - (b.plan_order ?? 0));

    const usage = new Map<string, number>();
    for (const action of planActions) {
      if (action.surprise_resource_id) usage.set(action.surprise_resource_id, (usage.get(action.surprise_resource_id) ?? 0) + 1);
    }
    const unmatched = planActions.filter((action) => !action.surprise_resource_id);
    if (!unmatched.length) return;

    const resources = await loadActiveResources(admin);
    if (!resources.length) return;

    await writeAssignments(admin, await matchActionsToResources(unmatched, resources, usage));
  } catch (e) {
    console.error("[surprise-resource-matching] plan matching failed", e instanceof Error ? e.message : e);
  }
}

/**
 * Re-maps one action after its title/how/why was edited, preferring
 * resources not already given elsewhere in the same plan. Skips actions whose
 * box is already unlocked (their resource is fixed) and plans without boxes.
 */
export async function matchSurpriseResourceForAction(admin: AdminClient, actionId: string): Promise<void> {
  try {
    const { data: walletAction } = await admin
      .from("commitment_wallet_actions")
      .select("plan_id, commitment_wallet_plans(surprise_boxes_enabled)")
      .eq("action_id", actionId)
      .maybeSingle();
    const planEnabled = (walletAction as unknown as { commitment_wallet_plans: { surprise_boxes_enabled: boolean } | null } | null)
      ?.commitment_wallet_plans?.surprise_boxes_enabled;
    if (!walletAction || !planEnabled) return;

    const { data: unlocked } = await admin.from("surprise_box_unlocks").select("id").eq("action_id", actionId).maybeSingle();
    if (unlocked) return;

    const [{ data: action }, { data: siblings }, resources] = await Promise.all([
      admin.from("actions").select("id, title, how, why").eq("id", actionId).single(),
      admin
        .from("commitment_wallet_actions")
        .select("actions(surprise_resource_id)")
        .eq("plan_id", walletAction.plan_id)
        .neq("action_id", actionId),
      loadActiveResources(admin),
    ]);
    if (!action || !resources.length) return;

    const usage = new Map<string, number>();
    for (const row of (siblings ?? []) as unknown as { actions: { surprise_resource_id: string | null } | null }[]) {
      const id = row.actions?.surprise_resource_id;
      if (id) usage.set(id, (usage.get(id) ?? 0) + 1);
    }

    await writeAssignments(admin, await matchActionsToResources([action as ActionToMatch], resources, usage));
  } catch (e) {
    console.error("[surprise-resource-matching] action re-match failed", e instanceof Error ? e.message : e);
  }
}
