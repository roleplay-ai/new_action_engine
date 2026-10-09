import { describe, expect, it } from "vitest";
import { buildSurpriseShelf, type ShelfActionInput, type ShelfUnlockInput } from "../surprise-boxes";

const plan = (statuses: (string | null)[]): ShelfActionInput[] =>
  statuses.map((status, i) => ({ actionId: `a${i + 1}`, actionTitle: `Action ${i + 1}`, status }));

const prize = { kind: "video" as const, title: "Video", description: "About it", durationLabel: null, url: "https://example.com", thumbnailUrl: null };
const unlock = (id: string, opened: boolean): ShelfUnlockInput => ({ unlockId: id, openedAt: opened ? "2026-10-08T10:00:00Z" : null, prize });

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

  it("keeps every box locked for plans without Surprise Boxes", () => {
    const shelf = buildSurpriseShelf(plan(["success", "failed", null]), new Map([["a1", unlock("u1", true)]]), false);
    expect(shelf.enabled).toBe(false);
    expect(shelf.boxes.map((box) => box.state)).toEqual(["locked", "locked", "locked"]);
    expect(shelf.unlockedCount).toBe(0);
  });
});
