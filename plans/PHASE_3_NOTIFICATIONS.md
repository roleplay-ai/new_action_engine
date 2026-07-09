# Phase 3: Notifications

**Planning source:** [PRODUCT_GUIDE.md](../PRODUCT_GUIDE.md) | **Overview:** [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md)

**Product Guide mapping:** Core User Features – **Intention & Planning**; notifications surface “you scheduled,” “you completed,” “package assigned,” and reminders.

**Goal:** Notifications work end-to-end (create, store, list, mark read). User scheduling is already in Phase 1; this phase adds the notifications table, creation on events, and in-app bell + list.

---

## 3.1 Notifications schema and RLS

```sql
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  read_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE read_at IS NULL;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own read_at" ON notifications FOR UPDATE USING (auth.uid() = user_id);
-- INSERT via service role or trusted Server Action only.
alter publication supabase_realtime add table notifications;
```

## 3.2 When to create notifications

- **User schedules an action (Phase 1):** In Phase 1 Server Action `scheduleAction` (or in Phase 3 by extending it), after inserting/updating `user_actions`, insert `notifications` (type `action_scheduled`, title/body with action title and date/time).
- **User completes an action (Phase 1):** After `validateAction` updates user_actions to success, insert `action_success` (optional).
- **Package assigned (Phase 2):** When superadmin assigns package to batch, insert `package_assigned` per user (extend Phase 2 Server Action or call from it).
- **Reminders (optional):** Cron (Vercel Cron or Supabase Edge Function) that finds `user_actions` with `scheduled_at` in next 24h and inserts `action_reminder` for each user.

## 3.3 Notification API and UI

- Server Actions: `getNotifications(userId, limit, offset)`, `markNotificationRead(id)`, `markAllRead(userId)`.
- Components: `NotificationBell` (icon + unread count), `NotificationList` (dropdown or page).
- Layout: Add bell to [Layout](../components/Layout.tsx) or [Sidebar](../components/Sidebar.tsx); wire to Server Actions; optional Supabase Realtime subscription on `notifications` for live updates.

---

## Deliverables

- `notifications` table and RLS; Server Actions for get/mark read; create notifications on schedule (retrofit Phase 1), on complete (retrofit Phase 1), on package assign (retrofit Phase 2); bell + list UI; optional reminder cron.

---

## File and folder hints

- `supabase/migrations/002_notifications.sql`, `app/actions/notifications.ts`, `components/NotificationBell.tsx`, `components/NotificationList.tsx`.

---

**Prev:** [PHASE_2b_SUPERADMIN_PANEL.md](PHASE_2b_SUPERADMIN_PANEL.md) | **Next:** [PHASE_4_SOCIAL_LAYER.md](PHASE_4_SOCIAL_LAYER.md)
