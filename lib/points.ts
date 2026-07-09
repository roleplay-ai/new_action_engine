/**
 * Effort Ledger - Point rules (Product Guide)
 * Acceptance 3 XP, Honesty Skip 1 XP, Success 5 XP,
 * Calendar Sync +2 XP, Streaks (weekly), Inaction -1 XP
 */

export const POINT_VALUES = {
  READ: 1,
  ACCEPT: 3,
  HONESTY_SKIP: 1,
  SUCCESS: 5,
  CALENDAR_SYNC: 2,
  // Weekly streak is disabled for now by product decision.
  WEEKLY_STREAK: 0,
  INACTION_DEDUCTION: -1,
} as const;

export type PointEvent =
  | "read"
  | "accept"
  | "honesty_skip"
  | "success"
  | "calendar_sync"
  | "weekly_streak"
  | "inaction";

/** Returns the points delta for a given event */
export function getPointsForEvent(event: PointEvent, hasCalendarSync = false): number {
  switch (event) {
    case "read":
      return POINT_VALUES.READ;
    case "accept":
      return POINT_VALUES.ACCEPT + (hasCalendarSync ? POINT_VALUES.CALENDAR_SYNC : 0);
    case "honesty_skip":
      return POINT_VALUES.HONESTY_SKIP;
    case "success":
      return POINT_VALUES.SUCCESS;
    case "calendar_sync":
      return POINT_VALUES.CALENDAR_SYNC;
    case "weekly_streak":
      return POINT_VALUES.WEEKLY_STREAK;
    case "inaction":
      return POINT_VALUES.INACTION_DEDUCTION;
    default:
      return 0;
  }
}

/** Leagues: Starter 0–24, Bronze 25–49, Silver 50–99, Gold 100–199, Diamond 200+ */
export function getLeagueFromPoints(points: number): string {
  if (points >= 200) return "Diamond";
  if (points >= 100) return "Gold";
  if (points >= 50) return "Silver";
  if (points >= 25) return "Bronze";
  return "Starter";
}

/**
 * Map league name (from getLeagueFromPoints) to numeric league index for profiles.league_index.
 * 0 = Starter, 1 = Bronze, 2 = Silver, 3 = Gold, 4 = Diamond.
 */
export function getLeagueIndexFromPoints(points: number): number {
  const league = getLeagueFromPoints(points);
  switch (league) {
    case "Bronze":
      return 1;
    case "Silver":
      return 2;
    case "Gold":
      return 3;
    case "Diamond":
      return 4;
    case "Starter":
    default:
      return 0;
  }
}
