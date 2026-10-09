"use server";

import { createClient } from "@/lib/supabase/server";
import {
  SURPRISE_BOX_BUCKET,
  buildSurpriseShelf,
  youtubeThumbnailUrl,
  type ShelfUnlockInput,
  type SurprisePrize,
  type SurpriseShelf,
} from "@/lib/surprise-boxes";

const EMPTY_SHELF: SurpriseShelf = { enabled: false, boxes: [], unlockedCount: 0 };

type PlanActionRow = { action_id: string; actions: { id: string; title: string; plan_order: number | null } | null };
type UnlockRow = {
  id: string;
  action_id: string;
  opened_at: string | null;
  surprise_box_resources: {
    kind: SurprisePrize["kind"];
    title: string;
    description: string;
    duration_label: string | null;
    storage_path: string | null;
    external_url: string | null;
    thumbnail_path: string | null;
  } | null;
};

/**
 * The caller's Surprise Box shelf for a cohort: one box per action frozen
 * into their Commitment Wallet plan, in delivery order. Returns an empty
 * shelf when there's no finalised plan.
 */
export async function getMySurpriseShelf(cohortId: string | null | undefined): Promise<{ shelf: SurpriseShelf; error?: string }> {
  try {
    if (!cohortId) return { shelf: EMPTY_SHELF };
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { shelf: EMPTY_SHELF, error: "Not authenticated" };

    const { data: plan } = await supabase
      .from("commitment_wallet_plans")
      .select("id, surprise_boxes_enabled")
      .eq("user_id", user.id)
      .eq("cohort_id", cohortId)
      .maybeSingle();
    if (!plan) return { shelf: EMPTY_SHELF };

    const [planActionsResult, statusesResult] = await Promise.all([
      supabase
        .from("commitment_wallet_actions")
        .select("action_id, actions(id, title, plan_order)")
        .eq("plan_id", plan.id),
      supabase.from("user_actions").select("action_id, status").eq("user_id", user.id).eq("cohort_id", cohortId),
    ]);
    if (planActionsResult.error) return { shelf: EMPTY_SHELF, error: planActionsResult.error.message };

    const statuses = new Map(
      ((statusesResult.data ?? []) as { action_id: string; status: string }[]).map((row) => [row.action_id, row.status])
    );
    const actions = ((planActionsResult.data ?? []) as unknown as PlanActionRow[])
      .map((row) => row.actions)
      .filter((action): action is NonNullable<PlanActionRow["actions"]> => !!action)
      .sort((a, b) => (a.plan_order ?? 0) - (b.plan_order ?? 0))
      .map((action) => ({ actionId: action.id, actionTitle: action.title, status: statuses.get(action.id) ?? null }));

    const enabled = !!plan.surprise_boxes_enabled;
    const loadUnlocks = () =>
      supabase
        .from("surprise_box_unlocks")
        .select("id, action_id, opened_at, surprise_box_resources(kind, title, description, duration_label, storage_path, external_url, thumbnail_path)")
        .eq("plan_id", plan.id);

    let { data: unlockData } = enabled ? await loadUnlocks() : { data: [] };

    // Self-heal: a completion whose unlock call failed still gets its box.
    // unlock_my_surprise_box is idempotent, so retrying is always safe.
    if (enabled) {
      const unlocked = new Set(((unlockData ?? []) as unknown as UnlockRow[]).map((row) => row.action_id));
      const missing = actions.filter((action) => action.status === "success" && !unlocked.has(action.actionId));
      if (missing.length) {
        await Promise.all(missing.map((action) => supabase.rpc("unlock_my_surprise_box", { p_action_id: action.actionId })));
        ({ data: unlockData } = await loadUnlocks());
      }
    }

    const bucket = supabase.storage.from(SURPRISE_BOX_BUCKET);
    const unlocks = new Map<string, ShelfUnlockInput>();
    for (const row of (unlockData ?? []) as unknown as UnlockRow[]) {
      const resource = row.surprise_box_resources;
      const url = resource?.storage_path ? bucket.getPublicUrl(resource.storage_path).data.publicUrl : resource?.external_url ?? "";
      unlocks.set(row.action_id, {
        unlockId: row.id,
        openedAt: row.opened_at,
        prize: resource && url
          ? {
              kind: resource.kind,
              title: resource.title,
              description: resource.description,
              durationLabel: resource.duration_label,
              url,
              thumbnailUrl: resource.thumbnail_path
                ? bucket.getPublicUrl(resource.thumbnail_path).data.publicUrl
                : youtubeThumbnailUrl(resource.external_url),
            }
          : null,
      });
    }

    return { shelf: buildSurpriseShelf(actions, unlocks, enabled) };
  } catch (e) {
    return { shelf: EMPTY_SHELF, error: e instanceof Error ? e.message : "Failed to load Surprise Boxes" };
  }
}

/** Records that the caller opened one of their boxes (first open wins). */
export async function markSurpriseBoxOpened(unlockId: string): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("mark_my_surprise_box_opened", { p_unlock_id: unlockId });
    return error ? { error: error.message } : {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to open Surprise Box" };
  }
}
