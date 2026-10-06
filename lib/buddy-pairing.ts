/**
 * Automatic commitment-buddy pairing for one batch.
 *
 * An assignment says "user sees buddy" (see commitment_buddy_assignments,
 * migration 070). A pair is two assignments pointing at each other; a
 * three-person cycle is A -> B -> C -> A.
 *
 * Rules (product decision):
 * - Groups that are already complete (a closed loop of 2+ current members,
 *   each seen by exactly one person) are kept as they are — this includes
 *   any pairing a superadmin made by hand.
 * - Everyone else ("unsettled": new members, or people whose pair/cycle was
 *   broken when someone left the batch) is shuffled and re-paired: pairs,
 *   plus one three-person cycle when the count is odd.
 * - A single leftover person joins an existing group: a pair becomes a
 *   three-person cycle, or they are slotted into an existing cycle.
 */

export type BuddyEdge = { userId: string; buddyId: string };

export type BuddyPairingPlan = {
  /** Assignments to delete (by the user whose outgoing edge goes away). */
  removeFor: string[];
  /** Assignments to create or replace. */
  upsert: BuddyEdge[];
};

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Members that belong to a complete, closed buddy loop of current members. */
export function findSettledMembers(memberIds: string[], edges: BuddyEdge[]): Set<string> {
  const members = new Set(memberIds);
  const out = new Map<string, string>();
  const inDegree = new Map<string, number>();
  for (const edge of edges) {
    if (!members.has(edge.userId)) continue;
    out.set(edge.userId, edge.buddyId);
    inDegree.set(edge.buddyId, (inDegree.get(edge.buddyId) ?? 0) + 1);
  }

  const settled = new Set<string>();
  for (const start of memberIds) {
    if (settled.has(start)) continue;
    const loop: string[] = [];
    let current: string | undefined = start;
    while (current && members.has(current) && !loop.includes(current) && loop.length <= memberIds.length) {
      loop.push(current);
      current = out.get(current);
    }
    const closed = current === start && loop.length >= 2;
    if (closed && loop.every((id) => inDegree.get(id) === 1)) loop.forEach((id) => settled.add(id));
  }
  return settled;
}

export function planBuddyPairing(memberIds: string[], edges: BuddyEdge[], random: () => number = Math.random): BuddyPairingPlan {
  const settled = findSettledMembers(memberIds, edges);
  const unsettled = shuffle(memberIds.filter((id) => !settled.has(id)), random);
  // Unsettled people lose whatever half-broken assignment they had.
  const removeFor = edges.filter((edge) => !settled.has(edge.userId)).map((edge) => edge.userId);
  const upsert: BuddyEdge[] = [];

  if (unsettled.length === 0) return { removeFor: [], upsert };

  if (unsettled.length === 1) {
    const [loner] = unsettled;
    const settledEdges = edges.filter((edge) => settled.has(edge.userId));
    if (settledEdges.length === 0) return { removeFor, upsert }; // nobody to pair with yet
    // Slot the loner in after a random settled person: P -> Q becomes P -> loner -> Q.
    // For a pair (A <-> B) this makes the three-person cycle A -> loner -> B -> A.
    const host = settledEdges[Math.floor(random() * settledEdges.length)];
    upsert.push({ userId: host.userId, buddyId: loner }, { userId: loner, buddyId: host.buddyId });
    return { removeFor, upsert };
  }

  let rest = unsettled;
  if (rest.length % 2 === 1) {
    const [a, b, c] = rest;
    upsert.push({ userId: a, buddyId: b }, { userId: b, buddyId: c }, { userId: c, buddyId: a });
    rest = rest.slice(3);
  }
  for (let i = 0; i < rest.length; i += 2) {
    upsert.push({ userId: rest[i], buddyId: rest[i + 1] }, { userId: rest[i + 1], buddyId: rest[i] });
  }
  return { removeFor, upsert };
}
