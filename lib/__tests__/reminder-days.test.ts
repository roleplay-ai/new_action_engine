import { describe, expect, it } from "vitest";
import { dueReminderDate, reminderDaysFor } from "../reminder-days";

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

describe("dueReminderDate", () => {
  // 2026-10-20 is a Tuesday, 2026-10-21 a Wednesday.
  const tuesdayWeekly = { track: "weekly" as const, days_of_week: [2], day_of_week: 2 };

  it("is due on the chosen day", () => {
    expect(dueReminderDate({ ...tuesdayWeekly, last_reminder_sent_date: "2026-10-13" }, "2026-10-20")).toBe("2026-10-20");
  });

  it("catches up a missed reminder day on the next run", () => {
    expect(dueReminderDate({ ...tuesdayWeekly, last_reminder_sent_date: "2026-10-13" }, "2026-10-21")).toBe("2026-10-20");
    expect(dueReminderDate({ ...tuesdayWeekly, last_reminder_sent_date: "2026-10-13" }, "2026-10-26")).toBe("2026-10-20");
  });

  it("is not due once the latest occurrence was sent", () => {
    expect(dueReminderDate({ ...tuesdayWeekly, last_reminder_sent_date: "2026-10-20" }, "2026-10-21")).toBeNull();
    expect(dueReminderDate({ ...tuesdayWeekly, last_reminder_sent_date: "2026-10-21" }, "2026-10-21")).toBeNull();
  });

  it("does not catch up an occurrence from before the subscription started", () => {
    expect(dueReminderDate({ ...tuesdayWeekly, last_reminder_sent_date: null }, "2026-10-22", "2026-10-21")).toBeNull();
    expect(dueReminderDate({ ...tuesdayWeekly, last_reminder_sent_date: null }, "2026-10-22", "2026-10-20")).toBe("2026-10-20");
  });

  it("daily track only catches up to the latest weekday", () => {
    const daily = { track: "daily" as const, days_of_week: null, day_of_week: null };
    expect(dueReminderDate({ ...daily, last_reminder_sent_date: "2026-10-19" }, "2026-10-21")).toBe("2026-10-21");
    // Saturday 2026-10-24 after a missed Friday.
    expect(dueReminderDate({ ...daily, last_reminder_sent_date: "2026-10-22" }, "2026-10-24")).toBe("2026-10-23");
    expect(dueReminderDate({ ...daily, last_reminder_sent_date: "2026-10-23" }, "2026-10-25")).toBeNull();
  });

  it("is never due without reminder days", () => {
    expect(dueReminderDate({ track: "weekly", days_of_week: null, day_of_week: null, last_reminder_sent_date: null }, "2026-10-21")).toBeNull();
  });
});
