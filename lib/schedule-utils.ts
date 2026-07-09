import type { ScheduleType } from "@/app/actions/email-schedule";

/**
 * After a schedule fires, compute the next run timestamp.
 * Returns null for specific_date (one-time; caller should deactivate).
 */
export function computeNextRunAt(
  scheduleType: ScheduleType,
  currentNextRun: Date,
  intervalDays?: number | null
): Date | null {
  switch (scheduleType) {
    case "daily": {
      const next = new Date(currentNextRun);
      next.setUTCDate(next.getUTCDate() + 1);
      return next;
    }
    case "weekly": {
      const next = new Date(currentNextRun);
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    }
    case "every_n_days": {
      const days = intervalDays ?? 1;
      const next = new Date(currentNextRun);
      next.setUTCDate(next.getUTCDate() + days);
      return next;
    }
    case "specific_date":
      return null;
  }
}
