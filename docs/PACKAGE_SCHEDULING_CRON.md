# Package scheduling & user flow

This doc explains how the **admin package scheduler** works and how package actions become visible and move into the Validation Queue.

---

## 1. What the admin configures

In the `AdminDashboard` **Control Panel** wizard:

- **Step 1 – Architect Content**
  - Admin selects actions to include in a package.
- **Step 2 – Pulse Logic**
  - `Campaign Start Date` → `packages.start_date`
  - `Delivery Time (Daily Window)` → `packages.delivery_time`
  - Duration / frequency are currently **UI-only** (no drip logic yet).
- **Step 3 – Deploy & Enrol**
  - Admin selects users in the company.
  - When they click **Deploy Action Package**, we:
    - Create the `packages` row.
    - Insert the chosen actions into `package_actions`.
    - Call `assignPackageToUsers(packageId, userIds, startDate)` which writes one row per user into `package_assignments` with:
      - `package_id`
      - `user_id`
      - `scheduled_start_date` (matches the campaign start date from the UI)

At this point **no user_actions are created**. Only the assignments exist.

---

## 2. User flow: Strategic Growth → Validation Queue

Package visibility and movement into the Validation Queue are **client-side** (no cron creating user_actions).

### 2.1 Before the scheduled time (IST)

- The dashboard (`lib/store.tsx`) loads the user’s `package_assignments`, related `packages` (start_date, delivery_time), and `package_actions`.
- For each assignment it computes the **activation time** in **India Standard Time (IST)** (same formula as below).
- If activation time is **in the future**, those package action IDs are added to `actionIdsInFuturePackages`.
- **Strategic Growth** shows `availableActions` = company actions **excluding** those in `actionIdsInFuturePackages` and those already in user_actions (non‑skipped/non‑failed).
- So package actions **do not appear** in Strategic Growth until the scheduled time has passed.

### 2.2 After the scheduled time (IST)

- Once the activation time is in the past, those action IDs are **no longer** in `actionIdsInFuturePackages`.
- They are still **not** in `user_actions` (nothing creates them server-side).
- So they **appear in Strategic Growth** as available actions.

### 2.3 User commits from Strategic Growth (two paths)

- **Plan Action** – User picks a day and time (and optional calendar sync). The app calls `scheduleAction`, which creates/upserts a `user_actions` row with status `"scheduled"`, `scheduled_at` = chosen datetime, and `accepted_at` = now. In the **Validation Queue** the card shows **“Scheduled for &lt;date&gt; at &lt;time&gt;”**. The user can verify once that time has passed.
- **I’ll do it** – User commits without picking a time (“do whenever”). The app calls `acceptActionWithoutSchedule`, which creates/upserts a `user_actions` row with status `"scheduled"`, `scheduled_at` = null, and `accepted_at` = now. In the **Validation Queue** the card shows **“Accepted on &lt;date&gt; at &lt;time&gt;”** and is **ready to verify immediately**.
- **Skip** – User declines. The app calls `declineAction`; the action gets status `"skipped"` and goes to the **Library** (Challenge Library) for history. The user can open Library later and **Plan again** if they want.

In both commit paths, the action leaves Strategic Growth and appears in the **Validation Queue**. From the queue the user verifies success or “Didn’t complete”. If they choose “Didn’t complete”, the action moves to **failed** and also appears in the **Library** so they can **Plan again** later.

Intended flow:

1. **After scheduled time** → package actions appear in **Strategic Growth**.
2. **User plans** (date/time) or **accepts** (do whenever) → action moves to **Validation Queue** (with “Scheduled for …” or “Accepted on …”).
3. User validates success or “Didn’t complete” from the Validation Queue. “Didn’t complete” → action goes to **Library**.
4. **Skipped** actions go to **Library**; user can **Plan again** from there.

---

## 3. Activation time (IST)

Activation is computed in the **client** (store) so that “after scheduled time” simply means “current time (UTC) is past the activation moment”.

- **Base date:** `assignment.scheduled_start_date ?? package.start_date`
- **Time of day:** `package.delivery_time` (default `"09:00:00"`)
- This date + time is interpreted as **IST (Asia/Kolkata)** and converted to UTC for comparison with `Date.now()`.
- The same IST→UTC conversion is used in the store’s `activationDateIST()` so that visibility is consistent.

---

## 4. Cron endpoint (no-op)

- **Route:** `app/api/cron/package-activation/route.ts`
- **Behaviour:** Does **not** create any `user_actions`. Package actions appear in Strategic Growth after the scheduled time (client-side), and the user accepts from there to add to the Validation Queue.
- The route still exists for compatibility (e.g. if you call it from Vercel Cron). It returns `{ ok: true, message: "..." }` and does not use Supabase.

---

## 5. Summary

- **Admin:** Creates package, sets start date + delivery time (IST), assigns users → only `package_assignments` (and package data) are stored.
- **Before scheduled time:** Package actions are hidden from Strategic Growth (via `actionIdsInFuturePackages`).
- **After scheduled time:** Package actions appear in **Strategic Growth**.
- **User accepts** an action (day/time) → `scheduleAction` creates `user_actions` → action appears in **Validation Queue**.
- No cron is required for this flow; the `/api/cron/package-activation` route is a no-op.

