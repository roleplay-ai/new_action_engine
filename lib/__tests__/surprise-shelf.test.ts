import { describe, expect, it } from "vitest";
import { bonusSlots, buildSurpriseShelf, type ShelfActionInput, type ShelfUnlockInput } from "../surprise-boxes";

const plan = (statuses: (string | null)[]): ShelfActionInput[] =>
  statuses.map((status, i) => ({ actionId: `a${i + 1}`, actionTitle: `Action ${i + 1}`, status }));

const prize = { kind: "video" as const, title: "Video", description: "About it", durationLabel: null, url: "https://example.com", thumbnailUrl: null };
const unlock = (id: string, opened: boolean): ShelfUnlockInput => ({ unlockId: id, openedAt: opened ? "2026-10-08T10:00:00Z" : null, prize });

describe("bonusSlots", () => {
  it("marks halfway and finale for a 12-action plan", () => {
    expect(bonusSlots(12)).toEqual({ halfway: 6, finale: 12 });
  });

  it("rounds halfway up for odd plans and skips it when it would be the finale", () => {
    expect(bonusSlots(5)).toEqual({ halfway: 3, finale: 5 });
    expect(bonusSlots(2)).toEqual({ halfway: 1, finale: 2 });
    expect(bonusSlots(1)).toEqual({ halfway: null, finale: 1 });
    expect(bonusSlots(0)).toEqual({ halfway: null, finale: null });
  });
});

describe("buildSurpriseShelf", () => {
  it("derives opened, ready, missed, next and locked states in plan order", () => {
    const shelf = buildSurpriseShelf(
      plan(["success", "success", "failed", "scheduled", null, null]),
      new Map([
        ["a1", unlock("u1", true)],
        ["a2", unlock("u2", false)],
      ]),
      true
    );

    expect(shelf.boxes.map((box) => box.state)).toEqual(["opened", "ready", "missed", "next", "locked", "locked"]);
    expect(shelf.unlockedCount).toBe(2);
    expect(shelf.boxes[0]).toMatchObject({ slot: 1, unlockId: "u1", prize });
    expect(shelf.boxes[3].prize).toBeNull();
  });

  it("opens a late completion even after later boxes were opened", () => {
    const shelf = buildSurpriseShelf(plan(["success", "success"]), new Map([["a1", unlock("u1", true)], ["a2", unlock("u2", true)]]), true);
    expect(shelf.boxes.map((box) => box.state)).toEqual(["opened", "opened"]);
  });

  it("tags bonus boxes", () => {
    const shelf = buildSurpriseShelf(plan(Array(12).fill(null)), new Map(), true);
    expect(shelf.boxes[5].bonus).toBe("halfway");
    expect(shelf.boxes[11].bonus).toBe("finale");
    expect(shelf.boxes.filter((box) => box.bonus)).toHaveLength(2);
  });

  it("keeps every box locked for plans without Surprise Boxes", () => {
    const shelf = buildSurpriseShelf(plan(["success", "failed", null]), new Map([["a1", unlock("u1", true)]]), false);
    expect(shelf.enabled).toBe(false);
    expect(shelf.boxes.map((box) => box.state)).toEqual(["locked", "locked", "locked"]);
    expect(shelf.unlockedCount).toBe(0);
  });
});
