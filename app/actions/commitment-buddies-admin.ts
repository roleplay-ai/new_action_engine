"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** One cohort member's manual buddy pairing state, for the superadmin's
 * mapping screen. `buddyId` is who this member currently sees (their
 * outgoing assignment). `seenBy` is who else has this member as *their*
 * buddy — the reverse edge. In a mutual pair that's the same person as
 * `buddyId` (so it's omitted, redundant); in a 3+ cycle it's a different
 * person, so the row can show both "sees" and "seen by" for clarity. */
export type BuddyMappingMember = {
  id: string;
  fullName: string | null;
  email: string | null;
  buddyId: string | null;
  buddyName: string | null;
  seenBy: { id: string; name: string | null }[];
  revealedAt: string | null;
};

async function requireSuperadmin(): Promise<{ userId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  const superadminEmail = (process.env.SUPERADMIN_EMAIL || "admin@actionengine").toLowerCase();
  const isSuperadminEmail = user.email?.toLowerCase() === superadminEmail;
  if (profile?.role !== "superadmin" && !isSuperadminEmail) {
    throw new Error("Forbidden: superadmin only");
  }

  return { userId: user.id };
}

/** Every member of the batch plus who they're currently paired to see.
 * Manual pairing is superadmin-only, so this bypasses RLS via the service-role
 * client the same way the rest of the batch admin surface reads member/profile
 * rows across companies (see getCompanyUsers/getCohortDetail in cohorts.ts). */
export async function listCommitmentBuddyRoster(cohortId: string): Promise<{
  error?: string;
  members?: BuddyMappingMember[];
}> {
  try {
    await requireSuperadmin();
    const admin = createAdminClient();

    const [{ data: members, error: membersError }, { data: assignments, error: assignmentsError }] = await Promise.all([
      admin
        .from("cohort_members")
        .select("user_id, profiles!cohort_members_user_id_fkey(id, full_name, email)")
        .eq("cohort_id", cohortId),
      admin
        .from("commitment_buddy_assignments")
        .select("user_id, buddy_user_id, revealed_at")
        .eq("cohort_id", cohortId),
    ]);
    if (membersError) return { error: membersError.message };
    if (assignmentsError) return { error: assignmentsError.message };

    type ProfileRow = { id: string; full_name: string | null; email: string | null };
    const nameMap = new Map<string, { fullName: string | null; email: string | null }>();
    for (const row of (members ?? []) as { user_id: string; profiles: ProfileRow | ProfileRow[] | null }[]) {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      nameMap.set(row.user_id, { fullName: profile?.full_name ?? null, email: profile?.email ?? null });
    }

    const assignmentMap = new Map<string, { buddyId: string; revealedAt: string | null }>();
    // Reverse index: who has each user as *their* buddy (there's normally at
    // most one, but this holds every incoming edge in case data ever ends up
    // with more than one pointing at the same person).
    const incomingMap = new Map<string, string[]>();
    for (const row of (assignments ?? []) as { user_id: string; buddy_user_id: string; revealed_at: string | null }[]) {
      assignmentMap.set(row.user_id, { buddyId: row.buddy_user_id, revealedAt: row.revealed_at });
      const incoming = incomingMap.get(row.buddy_user_id) ?? [];
      incoming.push(row.user_id);
      incomingMap.set(row.buddy_user_id, incoming);
    }

    const roster: BuddyMappingMember[] = ((members ?? []) as { user_id: string }[]).map((row) => {
      const info = nameMap.get(row.user_id) ?? { fullName: null, email: null };
      const assignment = assignmentMap.get(row.user_id) ?? null;
      const buddyInfo = assignment ? nameMap.get(assignment.buddyId) : null;
      // Drop the reciprocal partner from "seen by" — for a mutual pair that's
      // the same person as buddyId, and repeating their name adds no signal.
      const seenBy = (incomingMap.get(row.user_id) ?? [])
        .filter((seerId) => seerId !== assignment?.buddyId)
        .map((seerId) => ({ id: seerId, name: nameMap.get(seerId)?.fullName ?? null }));
      return {
        id: row.user_id,
        fullName: info.fullName,
        email: info.email,
        buddyId: assignment?.buddyId ?? null,
        buddyName: buddyInfo?.fullName ?? null,
        seenBy,
        revealedAt: assignment?.revealedAt ?? null,
      };
    });
    roster.sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));

    return { members: roster };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to load buddy mapping" };
  }
}

/** Manually creates (or replaces) a directional buddy circle for the given
 * members, in the order provided: member[0] sees member[1], member[1] sees
 * member[2], ... and the last member sees member[0] — closing the loop. Two
 * members is a normal mutual pair; three or more is a cycle (e.g. A->B->C->A).
 * Never auto-generated — always an explicit superadmin action. */
export async function saveCommitmentBuddyCircle(
  cohortId: string,
  orderedUserIds: string[]
): Promise<{ error?: string }> {
  try {
    await requireSuperadmin();

    const ids = orderedUserIds.map((id) => id.trim()).filter(Boolean);
    const uniqueIds = new Set(ids);
    if (ids.length < 2) return { error: "Pick at least two people to pair" };
    if (uniqueIds.size !== ids.length) return { error: "Each person can only appear once in a pairing" };

    const admin = createAdminClient();
    const { data: members, error: membersError } = await admin
      .from("cohort_members")
      .select("user_id")
      .eq("cohort_id", cohortId)
      .in("user_id", ids);
    if (membersError) return { error: membersError.message };
    const validIds = new Set((members ?? []).map((m: { user_id: string }) => m.user_id));
    if (ids.some((id) => !validIds.has(id))) return { error: "Everyone selected must be a member of this batch" };

    const rows = ids.map((userId, index) => ({
      cohort_id: cohortId,
      user_id: userId,
      buddy_user_id: ids[(index + 1) % ids.length],
      revealed_at: null,
    }));

    const { error } = await admin
      .from("commitment_buddy_assignments")
      .upsert(rows, { onConflict: "cohort_id,user_id" });
    if (error) return { error: error.message };

    revalidatePath("/superadmin/cohorts");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save buddy pairing" };
  }
}

/** Unpairs one member: clears who they see. Leaves the rest of any pair/cycle
 * they were part of untouched — a superadmin re-pairs those separately. */
export async function removeCommitmentBuddyAssignment(cohortId: string, userId: string): Promise<{ error?: string }> {
  try {
    await requireSuperadmin();
    const admin = createAdminClient();
    const { error } = await admin
      .from("commitment_buddy_assignments")
      .delete()
      .eq("cohort_id", cohortId)
      .eq("user_id", userId);
    if (error) return { error: error.message };

    revalidatePath("/superadmin/cohorts");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to remove buddy pairing" };
  }
}
