import { describe, expect, it } from "vitest";
import { reminderDaysFor } from "../reminder-days";

describe("reminderDaysFor", () => {
  it("sends daily-track reminders Monday to Friday", () => {
    expect(reminderDaysFor({ track: "daily", days_of_week: [2], day_of_week: 2 })).toEqual([1, 2, 3, 4, 5]);
  });

  it("uses the chosen day(s) on the weekly track", () => {
    expect(reminderDaysFor({ track: "weekly", days_of_week: [2], day_of_week: 4 })).toEqual([2]);
  });

  it("falls back to the legacy single day, or none", () => {
    expect(reminderDaysFor({ track: "weekly", days_of_week: null, day_of_week: 3 })).toEqual([3]);
    expect(reminderDaysFor({ track: "weekly", days_of_week: null, day_of_week: null })).toEqual([]);
  });
});
