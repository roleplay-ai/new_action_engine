"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CommitmentBuddyProgress = {
  id: string;
  name: string;
  done: number;
  skipped: number;
  missed: number;
  pointsEarned: number;
  pointsLost: number;
};

export type CommitmentBuddyGroup = {
  groupId: string | null;
  groupSize: number;
  revealPending: boolean;
  buddies: CommitmentBuddyProgress[];
};

const EMPTY_GROUP: CommitmentBuddyGroup = {
  groupId: null,
  groupSize: 0,
  revealPending: false,
  buddies: [],
};

function asNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapBuddyGroup(value: unknown): CommitmentBuddyGroup {
  if (!value || typeof value !== "object") return EMPTY_GROUP;
  const row = value as Record<string, unknown>;
  const buddies = Array.isArray(row.buddies)
    ? row.buddies.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const buddy = candidate as Record<string, unknown>;
        if (typeof buddy.id !== "string") return [];
        return [{
          id: buddy.id,
          name: typeof buddy.name === "string" && buddy.name.trim() ? buddy.name.trim() : "Cohort member",
          done: asNumber(buddy.done),
          skipped: asNumber(buddy.skipped),
          missed: asNumber(buddy.missed),
          pointsEarned: asNumber(buddy.pointsEarned),
          pointsLost: asNumber(buddy.pointsLost),
        }];
      })
    : [];

  return {
    groupId: typeof row.groupId === "string" ? row.groupId : null,
    groupSize: asNumber(row.groupSize),
    revealPending: row.revealPending === true,
    buddies,
  };
}

/**
 * Returns only the narrow, privacy-safe totals needed by the Actions UI.
 * The database RPC also creates any still-needed stable pair/trio after this
 * participant has activated the selected cohort plan.
 */
export async function getMyCommitmentBuddies(cohortId: string): Promise<{
  group: CommitmentBuddyGroup;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { group: EMPTY_GROUP, error: "Not authenticated" };

    const { data, error } = await supabase.rpc("get_my_commitment_buddies", {
      p_cohort_id: cohortId,
    });
    if (error) return { group: EMPTY_GROUP, error: error.message };

    return { group: mapBuddyGroup(data) };
  } catch (error) {
    return {
      group: EMPTY_GROUP,
      error: error instanceof Error ? error.message : "Failed to load commitment buddies",
    };
  }
}

export async function markMyCommitmentBuddyRevealed(cohortId: string): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { error } = await supabase.rpc("mark_my_commitment_buddy_revealed", {
      p_cohort_id: cohortId,
    });
    if (error) return { error: error.message };

    revalidatePath("/actions");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to save buddy reveal" };
  }
}
