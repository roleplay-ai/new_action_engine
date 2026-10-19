/**
 * Plan setup on My Actions (Phase 3 of docs/PARTICIPANT_JOURNEY_REDESIGN_PLAN.md):
 * the recommended pace, the choices the Change popup offers, and the total it
 * produces. Pure, so it is safe in client components; the server still
 * validates everything in saveGeneratedActions().
 */

export type PlanTrack = "weekly" | "daily";

export type PlanSetupChoice = {
  track: PlanTrack;
  /** Actions per week (weekly plans only; daily plans get one per weekday). */
  actionCount: 1 | 2 | 3;
  durationWeeks: number;
  /** 0 = Sunday … 6 = Saturday; the weekly reminder day. */
  dayOfWeek: number;
};

/** "Recommended" setup: 2 actions every Tuesday for 6 weeks = 12 actions. */
export const RECOMMENDED_PLAN_SETUP: PlanSetupChoice = { track: "weekly", actionCount: 2, durationWeeks: 6, dayOfWeek: 2 };

export const PLAN_DURATIONS = [2, 4, 6, 8, 10, 12] as const;
export const PLAN_REMINDER_DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
] as const;
/** Daily plans run Monday to Friday (DAILY_DELIVERY_DAYS in lib/personal-action-generation.ts). */
export const PLAN_DAILY_DAYS = [1, 2, 3, 4, 5];

/** Durations the batch allows (cohorts.max_weeks caps the plan length). */
export function availableDurations(maxWeeks?: number | null): number[] {
  const allowed = PLAN_DURATIONS.filter((weeks) => !maxWeeks || weeks <= maxWeeks);
  return allowed.length ? allowed : [PLAN_DURATIONS[0]];
}

/** The recommended setup, with the duration pulled down to fit the batch. */
export function recommendedSetup(maxWeeks?: number | null): PlanSetupChoice {
  const durations = availableDurations(maxWeeks);
  const durationWeeks = durations.includes(RECOMMENDED_PLAN_SETUP.durationWeeks)
    ? RECOMMENDED_PLAN_SETUP.durationWeeks
    : durations[durations.length - 1];
  return { ...RECOMMENDED_PLAN_SETUP, durationWeeks };
}

/** Same count as computeTotalActionsNeeded() on the server. */
export function totalPlanActions(setup: PlanSetupChoice): number {
  return setup.track === "daily" ? setup.durationWeeks * PLAN_DAILY_DAYS.length : setup.durationWeeks * setup.actionCount;
}

export function setupDaysOfWeek(setup: PlanSetupChoice): number[] {
  return setup.track === "daily" ? [...PLAN_DAILY_DAYS] : [setup.dayOfWeek];
}

export function sameSetup(a: PlanSetupChoice, b: PlanSetupChoice): boolean {
  if (a.track !== b.track || a.durationWeeks !== b.durationWeeks) return false;
  return a.track === "daily" || (a.actionCount === b.actionCount && a.dayOfWeek === b.dayOfWeek);
}
