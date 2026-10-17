import { describe, expect, it } from "vitest";
import { computeTotalActionsNeeded } from "../personal-action-generation";
import {
  RECOMMENDED_PLAN_SETUP,
  availableDurations,
  recommendedSetup,
  sameSetup,
  setupDaysOfWeek,
  totalPlanActions,
  type PlanSetupChoice,
} from "../plan-setup";
import { indianMobileDigits, isIndianMobile } from "../whatsapp-contacts";

describe("plan setup", () => {
  it("recommends 2 actions a week for 6 weeks (12 actions)", () => {
    expect(RECOMMENDED_PLAN_SETUP).toMatchObject({ track: "weekly", actionCount: 2, durationWeeks: 6 });
    expect(totalPlanActions(RECOMMENDED_PLAN_SETUP)).toBe(12);
  });

  it("fits the recommendation inside a batch's max weeks", () => {
    expect(availableDurations(4)).toEqual([2, 4]);
    expect(recommendedSetup(4).durationWeeks).toBe(4);
    expect(recommendedSetup(null).durationWeeks).toBe(6);
    expect(availableDurations(1)).toEqual([2]);
  });

  it("counts actions the same way the server does", () => {
    const setups: PlanSetupChoice[] = [
      { track: "weekly", actionCount: 3, durationWeeks: 8, dayOfWeek: 4 },
      { track: "daily", actionCount: 2, durationWeeks: 4, dayOfWeek: 2 },
      RECOMMENDED_PLAN_SETUP,
    ];
    for (const setup of setups) {
      const perDelivery = setup.track === "daily" ? 1 : setup.actionCount;
      expect(totalPlanActions(setup)).toBe(computeTotalActionsNeeded(setup.durationWeeks, perDelivery, setup.track, setupDaysOfWeek(setup)));
    }
  });

  it("ignores per-week count and day for daily plans when comparing", () => {
    const daily: PlanSetupChoice = { track: "daily", actionCount: 1, durationWeeks: 4, dayOfWeek: 1 };
    expect(sameSetup(daily, { ...daily, actionCount: 3, dayOfWeek: 5 })).toBe(true);
    expect(sameSetup(RECOMMENDED_PLAN_SETUP, { ...RECOMMENDED_PLAN_SETUP, dayOfWeek: 3 })).toBe(false);
  });
});

describe("Indian mobile numbers", () => {
  it("extracts the 10 digits from stored and formatted numbers", () => {
    expect(indianMobileDigits("919800000000")).toBe("9800000000");
    expect(indianMobileDigits("+91 98000 00000")).toBe("9800000000");
    expect(indianMobileDigits("9800000000")).toBe("9800000000");
    expect(indianMobileDigits("+44 7700 900123")).toBe("");
    expect(indianMobileDigits(null)).toBe("");
  });

  it("accepts only 10-digit numbers starting with 6-9", () => {
    expect(isIndianMobile("9800000000")).toBe(true);
    expect(isIndianMobile("5800000000")).toBe(false);
    expect(isIndianMobile("98000")).toBe(false);
  });
});
