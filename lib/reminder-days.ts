/**
 * Which weekdays a plan's action reminder goes out on (0 = Sunday). Shared by
 * the email (lib/action-reminders.ts) and WhatsApp (lib/whatsapp-reminders.ts)
 * reminders so both channels fire on exactly the same days. Dependency-free
 * so it can be unit tested.
 */

/** Daily-track plans are delivered and reminded Monday–Friday (= DAILY_DELIVERY_DAYS in lib/personal-action-generation.ts). */
const DAILY_REMINDER_DAYS = [1, 2, 3, 4, 5];

export function reminderDaysFor(sub: {
  track: "daily" | "weekly";
  days_of_week: number[] | null;
  day_of_week: number | null;
}): number[] {
  if (sub.track === "daily") return [...DAILY_REMINDER_DAYS];
  return sub.days_of_week ?? (sub.day_of_week != null ? [sub.day_of_week] : []);
}
