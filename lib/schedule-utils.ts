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

/**
 * Advance a recurring schedule beyond a reference time. This avoids a stale
 * schedule being processed repeatedly when more than one interval was missed.
 */
export function computeNextRunAtAfter(
  scheduleType: ScheduleType,
  currentNextRun: Date,
  after: Date,
  intervalDays?: number | null
): Date | null {
  const next = computeNextRunAt(scheduleType, currentNextRun, intervalDays);
  if (!next || next > after) return next;

  const cycleDays =
    scheduleType === "weekly"
      ? 7
      : scheduleType === "every_n_days"
        ? (intervalDays ?? 1)
        : 1;
  const cycleMs = cycleDays * 24 * 60 * 60 * 1000;
  const missedCycles =
    Math.floor((after.getTime() - next.getTime()) / cycleMs) + 1;
  next.setUTCDate(next.getUTCDate() + missedCycles * cycleDays);
  return next;
}
