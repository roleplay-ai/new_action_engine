# Phase 6: Polish and optional extensions

**Planning source:** [PRODUCT_GUIDE.md](../PRODUCT_GUIDE.md) | **Overview:** [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md)

**Goal:** Reminder delivery; email/push optional; calendar sync; multi-tenancy if needed.

---

## 6.1 Reminder delivery

- Cron (Vercel Cron or Supabase Edge Function): daily (e.g. 8am) find `user_actions` with `scheduled_at` today or tomorrow; ensure `action_reminder` notification exists for each; optionally send email/push via Resend/OneSignal.

## 6.2 Email and push (optional)

- Notifications table already exists; add worker or Edge Function that reads unread notifications and sends email (Resend) or push (OneSignal); mark sent in metadata or separate `notification_deliveries` table to avoid duplicate sends.

## 6.3 Calendar sync (Product Guide – Intention & Planning)

- **Product Guide:** Optional calendar integration doubles the XP reward (+2 XP) for commitment strength.
- “Add to calendar” link (ical) or integration (Google Calendar API) for scheduled actions; store `is_calendar_synced` and award +2 XP when user confirms (schema already has `is_calendar_synced`).

## 6.4 Multi-tenancy (optional)

- If multiple organizations: add `organization_id` to profiles, actions, packages; scope all queries and RLS by organization; superadmin can belong to an org or be global.

---

## Deliverables

- Reminder cron; optional email/push; calendar sync; optional org scoping.

---

## File and folder hints

- `app/api/cron/reminders/route.ts` or Supabase Edge Function; optional Resend/OneSignal integration.

---

**Prev:** [PHASE_5_ADMIN_ANALYTICS.md](PHASE_5_ADMIN_ANALYTICS.md)
