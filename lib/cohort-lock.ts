import { nextUpcomingCohortDate, daysUntil } from "./cohort-dates";

export type CohortLockState =
  | { locked: false }
  | { locked: true; daysToGo: number | null };

/** Resolves whether the given cohort currently blocks participant access
 * (My Plan, action creation, Commitment Wallet — see setCohortLock in
 * app/actions/cohorts.ts) and, if so, how many days remain until its next
 * scheduled date. `daysToGo` is null when the cohort has no upcoming date
 * to count down to. `cohort` is null when the user has no cohort at all —
 * treated as unlocked so the normal "no cohort" empty states still show. */
export function cohortLockInfo(
  cohort: { locked: boolean; dates: string[] } | null | undefined
): CohortLockState {
  if (!cohort?.locked) return { locked: false };
  const nextDate = nextUpcomingCohortDate(cohort.dates);
  const daysToGo = nextDate ? Math.max(0, daysUntil(nextDate)) : null;
  return { locked: true, daysToGo };
}
