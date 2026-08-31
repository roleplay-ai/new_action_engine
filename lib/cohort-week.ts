import { createAdminClient } from "@/lib/supabase/admin";
import { istToUTCDateTime, utcToISTDate } from "@/lib/timezone-utils";

type Admin = ReturnType<typeof createAdminClient>;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** IST midnight for a YYYY-MM-DD calendar date. */
export function weekAnchorFromIstDate(istDate: string): Date {
  return new Date(istToUTCDateTime(istDate, "00:00"));
}

/**
 * Week origin for an ISO timestamp: IST midnight of the IST calendar day it
 * falls on. Date-only strings (YYYY-MM-DD) are IST calendar dates, not UTC.
 */
export function weekAnchorFromTimestamp(iso: string): Date {
  if (DATE_ONLY.test(iso)) return weekAnchorFromIstDate(iso);
  const istDate = utcToISTDate(iso);
  return istDate ? weekAnchorFromIstDate(istDate) : new Date(iso);
}

/** 1-indexed week number for `date` relative to a week's IST-midnight origin. */
export function weekNumberFor(date: Date, anchor: Date): number {
  const diffDays = Math.floor((date.getTime() - anchor.getTime()) / DAY_MS);
  return Math.max(1, Math.floor(diffDays / WEEK_DAYS) + 1);
}

/**
 * Per-cohort week origin for admin charts. Prefers the IST date of the first
 * action delivery (`user_actions.scheduled_at`); falls back to the earliest
 * `cohort_dates.event_date`, then `cohorts.created_at`.
 */
export async function resolveCohortWeekAnchors(
  admin: Admin,
  cohortIds: string[]
): Promise<Map<string, Date>> {
  const anchors = new Map<string, Date>();
  if (!cohortIds.length) return anchors;

  const { data: cohortRows } = await admin.from("cohorts").select("id, created_at").in("id", cohortIds);
  for (const c of (cohortRows ?? []) as { id: string; created_at: string }[]) {
    anchors.set(c.id, weekAnchorFromTimestamp(c.created_at));
  }

  const { data: dateRows } = await admin
    .from("cohort_dates")
    .select("cohort_id, event_date")
    .in("cohort_id", cohortIds)
    .order("event_date", { ascending: true });
  const seenDates = new Set<string>();
  for (const d of (dateRows ?? []) as { cohort_id: string; event_date: string }[]) {
    if (seenDates.has(d.cohort_id)) continue;
    seenDates.add(d.cohort_id);
    anchors.set(d.cohort_id, weekAnchorFromIstDate(d.event_date));
  }

  const { data: deliveryRows } = await admin
    .from("user_actions")
    .select("cohort_id, scheduled_at")
    .in("cohort_id", cohortIds)
    .not("scheduled_at", "is", null);
  const firstDelivery = new Map<string, string>();
  for (const row of (deliveryRows ?? []) as { cohort_id: string | null; scheduled_at: string | null }[]) {
    if (!row.cohort_id || !row.scheduled_at) continue;
    const prev = firstDelivery.get(row.cohort_id);
    if (!prev || row.scheduled_at < prev) firstDelivery.set(row.cohort_id, row.scheduled_at);
  }
  for (const [id, iso] of firstDelivery) {
    anchors.set(id, weekAnchorFromTimestamp(iso));
  }

  return anchors;
}
