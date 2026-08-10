/** Shared helpers for a cohort's multiple dates (see cohort_dates table).
 * `dates` is always a list of ISO "YYYY-MM-DD" strings. */

/** Local calendar date as YYYY-MM-DD — must match daysUntil's local midnight. */
function localTodayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The earliest date that is today or later, or null if the list is empty or
 * every date has already passed. */
export function nextUpcomingCohortDate(dates: string[]): string | null {
  const todayKey = localTodayKey();
  const upcoming = dates.filter((date) => date >= todayKey).sort();
  return upcoming[0] ?? null;
}

/** Whole days from local midnight today to local midnight on `dateStr`.
 * 0 on the day itself, negative once it has passed. */
export function daysUntil(dateStr: string): number {
  const target = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((target.getTime() - today.getTime()) / msPerDay);
}
