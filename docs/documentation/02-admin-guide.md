# Company Admin Guide (role: `admin`)

> Part of the Nudgeable Action Engine documentation set. See [README.md](./README.md) for the index and [00-architecture-overview.md](./00-architecture-overview.md) for cross-cutting concepts. This document is technical + feature-level.

---

## 1. Access & scoping

A company admin (`profiles.role = 'admin'`) manages exactly one company, fixed to their own `profiles.company_id`. Every admin route (`/admin` and its sub-pages) independently re-checks `profile.role IN ('admin','superadmin')` server-side and redirects to `/` otherwise; every server action re-checks the same thing again before touching data.

**Company scoping is enforced in application code, not by the client**: wherever a server action needs a `companyId`, the rule is `role === "admin" ? theirOwnCompanyId : clientSuppliedCompanyId` — an `admin`'s requests always use their own company server-side, regardless of what the client sends. Mutations that touch an existing row (editing/deleting an action, configuring a package) additionally re-fetch that row's `company_id` and reject the request if it doesn't match — so an admin can't act on another company's data even by guessing IDs.

**Superadmins share this same panel**: everything below also works for a `superadmin`, except they get a company picker at the top of the panel (since they have no fixed `company_id` of their own) and can switch which company's data they're viewing/editing.

**No company assigned**: if an admin's `company_id` is null, most actions refuse with "Admin is not assigned to a company" and the UI shows a warning banner instead of the normal panel.

### Navigation

Sidebar sections: **Dashboard**, **Analytics** (Engagement, Action Metrics), **Control Panel** (Action Management, Package Management, User Management, Email Management).

---

## 2. Dashboard

Route: `/admin`. Four widgets, all company-scoped and all excluding `admin`/`superadmin` accounts from the counts (only `role='user'` rows count toward "users"):

- **Consistently Active Users** — the % of the company's users who have interacted with *every* action ever delivered to them across all their package assignments (a "ratio of 1.0" user).
- **Inactive Users** — count of users with zero `user_actions` rows at all. (Has a "Nudge Strategy" button — not wired to anything yet.)
- **Behavioral Journey Funnel** — four stage cards:
  - *Knowledge*: total action-slots delivered (actions × assigned users across all packages) and the average per user.
  - *Intention*: how many of those were accepted/scheduled (including habit-loop reps).
  - *Actions*: how many were successfully validated (including habit-loop reps).
  - *Habits*: total reps completed, split ongoing vs. cemented.
- **Drivers Effectiveness** — acceptance rate per theme (Collaboration / Accountability / Feedback / Connection / Coaching): what fraction of that theme's delivered actions reached at least `scheduled` status.
- **User Engagement breakdown** — % of users who are Action Readers (≥1 interaction), Habit Starters (started or cemented at least one habit), Action Takers (at least one success), or Inactive.
- **Weekly Actions chart** — accepted vs. skipped vs. successful counts, grouped by delivery week.
- **Habits by Phase** — pie chart of ongoing vs. cemented habits.
- **Action Adoption Index** — top-3 and bottom-3 actions by conversion rate (validated ÷ accepted), i.e. which content is landing and which is meeting resistance.

The "Download Report" button in the header has no handler — it's a placeholder, not a working export.

---

## 3. Action management

Route: `/admin/control-panel/actions`. This is full CRUD over the company's action bank.

**Fields**: theme (Collaboration / Accountability / Feedback / Connection / Coaching), title ("What"), how ("Tactical Step"), why ("Behavioral Logic"), time estimate (2 / 5 / 15 minutes, default 5). There is **no points field** on an action — points are a fixed function of *event type* (accept/validate/cement), not a per-action value (see [01-user-guide.md](./01-user-guide.md#6-points--xp)).

- **Create** — a form on the left; new actions are attached to the admin's company automatically.
- **Edit** — inline modal per row.
- **Delete** — blocked if any user has ever interacted with the action ("Cannot delete: action is in use by users. Consider hiding or archiving instead.") — note there is currently no archive/hide mechanism actually implemented, so in practice an in-use action simply can't be removed.

The table has theme filter tabs but no search box and no pagination.

---

## 4. Package management

Route: `/admin/control-panel/packages`. A **package** is a named, scheduled bundle of actions from the company's bank, deployed to a set of users. This is the only mechanism by which an action actually reaches a user's dashboard.

A 3-step wizard:

1. **Architect Content** — name the package, multi-select actions from the company's bank (filterable by theme).
2. **Schedule** — set a campaign start date, a fallback activation time (IST), and a duration in weeks. Then, per week, assign specific selected actions to a delivery date/time (each action can only live in one week at a time).
3. **Enroll & Deploy** — optionally multi-select company users to assign immediately, with a live summary (total actions / deliveries / assigned / unassigned / users selected).

Deploying does three things in sequence: creates the `packages` row, replaces that package's delivery configuration (deletes and re-inserts `package_actions`), and — if users were selected — creates `package_assignments` rows for each of them.

**Important limitations**:
- There is **no edit-existing-package flow** and **no delete-package action**. Once deployed, a package's content is fixed; the only way to add more users later is to re-run parts of the flow (there's no "add users to existing package" screen either).
- There is no "rule of five" or "actions-per-week cap" field on a package — the 5-repetition habit logic lives entirely in the validation/habit-loop code, not in package configuration.
- An action must have at least one delivery slot before users can be assigned to the package.

### How delivery/activation actually works

An action becomes visible to an assigned user once `now >= (delivery_date/time, or start_date + week offset, falling back to a default time) + a 1-minute grace period`. **This check happens client-side, at query/email-render time** — there is no cron job that materializes anything. See the "Package History" tab on this same screen for a read-only list of past packages (name, dates, duration, action count, users assigned) — no per-package drill-down.

---

## 5. User management

Route: `/admin/control-panel/users`. Scoped to the admin's own company.

- **List** — every user in the company (name, email, role), pulled by cross-referencing `profiles` with Supabase Auth's user list to get emails.
- **Create** — a modal with a name, email, and password field (includes a random-password generator and a show/hide toggle). New accounts created here are always `role: "user"` — **a company admin cannot promote another user to admin from this screen**, only a superadmin can. Behind the scenes this also stores the plaintext password in a delivery table so it can later be emailed (see §6) — Supabase Auth itself only stores a hash, so this is the one place the actual password is recoverable after creation.
- **Remove** — unassigns the user from the company (`company_id` set to null); this does **not** delete their account or history, and admin/superadmin accounts cannot be removed this way.

There is no per-user detail/progress drill-down and no "assign package to this user" shortcut from this screen — package assignment only happens through the Package Management wizard (§4).

---

## 6. Email management

Route: `/admin/control-panel/email`. This screen does exactly one thing: **send login credential emails to users the admin created**, nothing more.

- Lists company users, flagging which ones have a stored password on file (i.e., were created via the User Management "Create" flow and haven't had it deleted).
- Admin selects one or more eligible users and clicks "Send" — each gets a SendGrid email containing their actual login email, the plaintext password on file, and a link to the normal `/login` page.
- Every send (success or failure) is logged; a "Last send results" panel shows per-user outcomes after sending.
- Credentials are **not** deleted after sending, so an admin can resend as many times as needed if a user loses the email.

**What is not here**: no template picker, no scheduling, no general "email everyone" broadcast, no campaign builder. Those capabilities exist in the codebase (`email-campaign.ts`, `email-schedule.ts`) but are gated to `superadmin` only — see [03-superadmin-guide.md](./03-superadmin-guide.md#email-scheduling).

---

## 7. Analytics

### Action Metrics (`/admin/analytics/action-metrics`)

- **Organizational Skill Drivers** — same per-theme acceptance rates as the dashboard, shown as bars.
- **Micro-Action Performance Bank** — every action ranked by conversion rate (validated ÷ accepted), so an admin can see at a glance which content is actually working versus which is being accepted but never followed through on.

### Engagement (`/admin/analytics/engagement`)

A per-user leaderboard-style table: points, streak, league, and counts of accepted / validated / habit-started actions for every end user in the company. Supports a live name search and sorts by points. There's no CSV export and no date-range filter on this screen.

---

## 8. Automated emails affecting admins' users

The only automated (non-manual) email delivery is a single daily platform-wide cron job, configured and monitored entirely from the **superadmin** panel — a company admin has no control over its schedule or content beyond what's described in §6. See [03-superadmin-guide.md](./03-superadmin-guide.md#cron--automated-sending).

---

## 9. Things to know that aren't obvious from the UI

- All admin analytics reads use a service-role client that bypasses Row-Level Security — the company-scoping guarantee comes entirely from the hand-written `role === 'admin' ? myCompanyId : ...` checks in each server action, not from the database.
- There's no bulk import for users or actions — everything is single-row via a form/modal.
- There's no audit trail visible in the admin UI for who created/edited/deleted an action or removed a user (email sends are logged, but that log isn't surfaced in the company admin panel — only superadmin has read access to it).
