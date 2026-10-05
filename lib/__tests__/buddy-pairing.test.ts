import { describe, expect, it } from "vitest";
import { findSettledMembers, planBuddyPairing, type BuddyEdge } from "../buddy-pairing";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `u${i + 1}`);

/** Applies a plan to the current edges, like the server action does. */
function apply(edges: BuddyEdge[], plan: ReturnType<typeof planBuddyPairing>): BuddyEdge[] {
  const out = new Map(edges.filter((e) => !plan.removeFor.includes(e.userId)).map((e) => [e.userId, e.buddyId]));
  for (const e of plan.upsert) out.set(e.userId, e.buddyId);
  return [...out].map(([userId, buddyId]) => ({ userId, buddyId }));
}

/** Every member sees exactly one other member and is seen by exactly one. */
function expectEveryonePaired(members: string[], edges: BuddyEdge[]) {
  expect(findSettledMembers(members, edges).size).toBe(members.length);
  for (const e of edges) expect(e.userId).not.toBe(e.buddyId);
}

function groupSizes(members: string[], edges: BuddyEdge[]): number[] {
  const out = new Map(edges.map((e) => [e.userId, e.buddyId]));
  const seen = new Set<string>();
  const sizes: number[] = [];
  for (const start of members) {
    if (seen.has(start)) continue;
    let size = 0;
    let current: string | undefined = start;
    while (current && !seen.has(current)) {
      seen.add(current);
      size += 1;
      current = out.get(current);
    }
    sizes.push(size);
  }
  return sizes.sort();
}

describe("planBuddyPairing", () => {
  it("pairs an even batch into twos", () => {
    const members = ids(6);
    const edges = apply([], planBuddyPairing(members, []));
    expectEveryonePaired(members, edges);
    expect(groupSizes(members, edges)).toEqual([2, 2, 2]);
  });

  it("makes one three-person cycle when the batch is odd", () => {
    const members = ids(7);
    const edges = apply([], planBuddyPairing(members, []));
    expectEveryonePaired(members, edges);
    expect(groupSizes(members, edges)).toEqual([2, 2, 3]);
  });

  it("keeps existing complete pairs and only pairs the new people", () => {
    const members = ids(6);
    const existing: BuddyEdge[] = [
      { userId: "u1", buddyId: "u2" },
      { userId: "u2", buddyId: "u1" },
    ];
    const plan = planBuddyPairing(members, existing);
    expect(plan.upsert.some((e) => e.userId === "u1" || e.userId === "u2")).toBe(false);
    expect(plan.removeFor).toEqual([]);
    expectEveryonePaired(members, apply(existing, plan));
  });

  it("adds a single newcomer to an existing pair as a three-person cycle", () => {
    const members = ids(3);
    const existing: BuddyEdge[] = [
      { userId: "u1", buddyId: "u2" },
      { userId: "u2", buddyId: "u1" },
    ];
    const edges = apply(existing, planBuddyPairing(members, existing));
    expectEveryonePaired(members, edges);
    expect(groupSizes(members, edges)).toEqual([3]);
  });

  it("re-pairs someone whose buddy left the batch", () => {
    // u3 left: u4 -> u3 is broken (u3 is no longer a member).
    const members = ["u1", "u2", "u4", "u5"];
    const existing: BuddyEdge[] = [
      { userId: "u1", buddyId: "u2" },
      { userId: "u2", buddyId: "u1" },
      { userId: "u4", buddyId: "u3" },
    ];
    const plan = planBuddyPairing(members, existing);
    expect(plan.removeFor).toContain("u4");
    expectEveryonePaired(members, apply(existing, plan));
  });

  it("leaves a lone member unpaired when there is no one else", () => {
    expect(planBuddyPairing(["u1"], [])).toEqual({ removeFor: [], upsert: [] });
  });
});
