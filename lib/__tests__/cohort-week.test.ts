import { describe, expect, it } from "vitest";
import { weekAnchorFromIstDate, weekAnchorFromTimestamp, weekNumberFor } from "@/lib/cohort-week";

describe("weekAnchorFromTimestamp", () => {
  it("uses IST midnight of the delivery's IST calendar day", () => {
    // Surge's first delivery: Mon 24 Aug 2026 11:35 IST.
    const anchor = weekAnchorFromTimestamp("2026-08-24T06:05:07.560Z");
    expect(anchor.toISOString()).toBe("2026-08-23T18:30:00.000Z");
    expect(weekAnchorFromIstDate("2026-08-24").toISOString()).toBe(anchor.toISOString());
  });

  it("treats date-only strings as IST calendar dates, not UTC midnight", () => {
    expect(weekAnchorFromTimestamp("2026-08-20").toISOString()).toBe("2026-08-19T18:30:00.000Z");
  });
});

describe("weekNumberFor from first delivery", () => {
  const anchor = weekAnchorFromTimestamp("2026-08-24T06:05:07.560Z");

  it("keeps the workshop week and mid-week days in week 1", () => {
    expect(weekNumberFor(new Date("2026-08-24T06:05:07.560Z"), anchor)).toBe(1);
    expect(weekNumberFor(new Date("2026-08-27T05:47:00.000Z"), anchor)).toBe(1);
    expect(weekNumberFor(new Date("2026-08-30T18:29:59.000Z"), anchor)).toBe(1);
  });

  it("opens week 2 at IST midnight of the 8th calendar day", () => {
    expect(weekNumberFor(new Date("2026-08-30T18:30:00.000Z"), anchor)).toBe(2);
    expect(weekNumberFor(new Date("2026-08-31T06:00:00.000Z"), anchor)).toBe(2);
  });

  it("clamps dates before the first delivery to week 1", () => {
    expect(weekNumberFor(new Date("2026-08-20T00:00:00.000Z"), anchor)).toBe(1);
  });
});
