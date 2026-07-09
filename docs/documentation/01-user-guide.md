# User Guide (role: `user`)

> Part of the Nudgeable Action Engine documentation set. See [README.md](./README.md) for the index and [00-architecture-overview.md](./00-architecture-overview.md) for cross-cutting concepts (roles, auth, dead code). This document is technical + feature-level: it describes what a regular end user can do, and cites the exact code behind it.

---

## 1. Getting in

There is no self-serve signup. An account is created for a user by a [company admin](./02-admin-guide.md#user-management) or [superadmin](./03-superadmin-guide.md#global-user-management), who sets an initial email + password and assigns a `company_id`. The user then reaches the app one of three ways:

- **Password login** at `/login` — `supabase.auth.signInWithPassword()` (`app/(auth)/login/page.tsx:15-32`), then a full page redirect to `/`.
- **Auto-login link** — a permanent, one-click link (`{app}/api/auto-login?key=<uuid>`) embedded in system emails (weekly digest, credential email, admin-sent login email). Clicking it logs the user in without a password. See [03-superadmin-guide.md](./03-superadmin-guide.md#auto-login--credential-delivery) for the mechanics.
- **Credential email** — an email containing the user's actual (plaintext) password and a link to the normal `/login` page, sent by a company admin from their Email Management screen.

On every visit, `app/(app)/page.tsx:5-27` looks up the caller's `profiles.role` and routes them: `superadmin` → `/superadmin`, `admin` → `/admin`, anything else → the regular dashboard described below.

**Self-serve AI onboarding.** The first time a user with a company reaches the dashboard (`profiles.self_onboarding_completed_at` is `null`), `components/Onboarding.tsx` opens as a full-screen wizard: two questions (what training they did, and which focus themes they want to work on), a preview of a few example actions, an AI-generated batch of 3-5 draft actions (Gemini Flash via `app/actions/ai-actions.ts::generatePersonalActions`), an edit/accept step, and a final step to set a start date/time and weekly frequency per action. Accepting persists each kept draft as a personal action (`actions.is_personal = true`, visible only to that user) and sets up a weekly reminder (see §5). A user can skip at any point; skipping still marks onboarding complete so it won't nag again.

**No company yet**: if a user's `profiles.company_id` is null (created but not yet assigned to a company), the dashboard and challenge library show a "Not assigned to a company — contact your admin" placeholder instead of content.

**Logout**: the navbar logout button calls `supabase.auth.signOut()` and redirects to `/login`.

---

## 2. Layout & navigation

The app shell (`components/Layout.tsx`) exposes exactly three tabs:

| Tab | Content |
|---|---|
| **Dashboard** (`home`) | Today's queue, weekly reminders, action carousels — see §3 |
| **Challenges** (`challenges`) | Retry queue for skipped/failed actions — see §4 |
| **Progress** (`progress`) | Personal analytics + leaderboard — see §8 |

The navbar also shows a 🔥 streak badge (sourced from `profiles.streak` — see the caveat in [00-architecture-overview.md](./00-architecture-overview.md#6-known-dead-code--inert-features), it does not appear to be incremented anywhere) and a notification bell that simply switches to the Dashboard tab (there is no real notification system behind it).

---

## 3. Dashboard

The dashboard (`app/(app)/dashboard-client.tsx`) pulls together every action assigned to the user through their company's [packages](./02-admin-guide.md#package-management), sorted into a few working sets:

- **Available actions carousel** — actions from an *activated* package assignment that the user hasn't yet interacted with. A package action is "activated" once its scheduled delivery date/time has passed by at least one minute (a small grace window baked into the query in `lib/store.tsx`).
- **Validation queue** — actions the user scheduled whose time has arrived, waiting to be marked done or not.
- **This Week's Reminders** — the user's active weekly reminders (`action_reminders`), each with a one-click "Mark done" for the current week (see §5).

### Accepting / declining an action (`components/ActionCard.tsx`)

Each action card shows its **theme** tag (Collaboration / Feedback / Accountability / Connection / Coaching), title, time estimate, and an expandable "How & Why" detail (`action.how` = tactical step, `action.why` = the behavioral rationale). Three things a user can do:

1. **Accept & schedule** — pick a date and time (defaults to today, 09:00 IST) and whether to sync a calendar invite, then "Commit Plan." This calls the `scheduleAction` server action, which:
   - Upserts a `user_actions` row (`status: "scheduled"`, the chosen `scheduled_at`).
   - Awards points (see §7).
   - Logs an `ACCEPTED` feed event.
   - If calendar sync is on, emails the user an `.ics` calendar invite (via SendGrid) plus a pre-filled "Add to Google Calendar" link. **This is an emailed invite, not a live OAuth-connected calendar integration** — nothing writes directly into the user's calendar.
2. **Accept without scheduling** — the "×" on the schedule overlay; same as above but `scheduled_at` stays null and no calendar email is sent.
3. **Decline** — always available, no confirmation. Sets `status: "skipped"` and logs a `DECLINED` feed event. This is intentionally framed as an "honesty skip" (see §7) — declining is rewarded, not just accepting, to encourage honest engagement over silent avoidance.

### Validating an action

Once a scheduled/accepted action's time has passed, it shows up in the validation queue. Tapping it opens a modal:

1. **Reflection prompt** — a free-text box ("What was the tactical result or friction point?"), then either **Verify** (success) or **Didn't Complete** (failure).
2. **Celebration screen** (success only) — confetti animation. Note: the on-screen "+50 XP" badge here is decorative copy, not the real point award (see §7).

Both success and failure are recorded via the `validateAction` server action, which just sets `status` to `success`/`failed` — there is no rep-tracking or cementing threshold (that mechanic was replaced by weekly reminders, see §5).

---

## 4. Challenges (retry queue)

Despite the "library" framing, the Challenges tab (`components/Challenges.tsx`) is **not** a general browse-all-actions screen — it deliberately only surfaces actions the user has previously **skipped** or marked **"Didn't complete."** It's a second-chance queue, with a search box (matches title/theme) and filter chips (All / Skipped / Didn't complete). Re-accepting from here shows a "Plan again" button instead of "Accept," but goes through the same scheduling flow as §3.

---

## 5. Weekly reminders (replaces the old Habit Loop)

There is no more in-app rep-tracking or "Rule of 5" cementing. Instead, any accepted action (admin-assigned or self-generated) can have a standing weekly reminder (`action_reminders`, one row per `user_actions` row):

- The user picks how many **times per week** they intend to do the action (1–7) and an intended **time of day** (IST, shown as display copy in the email — not a literal send time).
- Every Monday, the cron job (`app/api/cron/email-scheduler/route.ts`, same daily trigger as the rest of the email scheduler) sends **one summary email per user** listing all of their due reminders for the week, via `lib/action-reminder-email.ts` + `lib/email-send.ts`.
- In-app, the dashboard's "This Week's Reminders" panel lets the user mark a reminder done for the current ISO week (`action_reminder_completions`, one row per reminder per week) — a lightweight check-in, not a multi-rep counter.

Today, reminders are created as part of the self-serve onboarding wizard (§1) via `app/actions/action-reminders.ts::createActionReminder`; the regular `ActionCard` accept/schedule flow does not yet prompt for a reminder.

---

## 6. Points / XP

All points are computed and written **server-side only** — nothing on the client calculates or persists XP. The real, canonical values (`lib/points.ts`):

| Event | XP | Notes |
|---|---|---|
| Reading (first time an action gets a `user_actions` row) | +1 | One-time per action |
| Accept / schedule | +3 (or +5 with calendar sync) | One-time per action |
| Decline ("honesty skip") | +1 | One-time per action |
| Successful validation | +5 | One-time per action (status becomes `success`) |
| Weekly reminder marked done | +5 | Once per reminder per ISO week (`action_reminder_completions`) |
| Failed validation (first time only) | −1 | Floored so total points never go below 0 |
| Weekly streak bonus | +0 | Present in code as a constant but explicitly disabled by product decision |

The "+50 XP" badge shown on the success-celebration screen is cosmetic copy, not a real award — do not treat it as documentation of the point system. Total points are recomputed from the user's full action history on every dashboard load (a self-healing backfill/sync step), so the displayed total always reflects the rules above even if a past write was interrupted.

---

## 7. Leagues

A user's `total_points` maps to a league:

| League | Threshold |
|---|---|
| Diamond | ≥ 200 |
| Gold | ≥ 100 |
| Silver | ≥ 50 |
| Bronze | ≥ 25 |
| Starter | < 25 (default) |

The league is recomputed alongside the points sync described above, so it always reflects current `total_points`.

---

## 8. Progress tab (personal analytics)

`components/Analytics.tsx` — entirely client-derived from data already loaded for the dashboard (no separate server action for the user's own view):

- **Behavioral Transition Funnel** — Knowledge / Intention / Action percentages, derived from how many of the user's assigned actions have reached each stage.
- **Current Level card** — league badge, points, and how many points away from the next league.
- **Achievement Wall** — the five league badges, current one highlighted.
- **Phase breakdown** — counts of Received / Read / Accepted / Skipped / Validated / Failed / Ongoing actions.
- **Leaderboard** (embedded) — see below.

### Leaderboard

Company-scoped: it ranks every `profiles` row sharing the user's `company_id` by `total_points` descending (there is no role filter, so an admin who happens to share the company shows up too). If the user has no company yet, the leaderboard is just them, alone, so the screen still renders sensibly. There's no realtime updating — it's re-queried whenever the user's own point total changes.

A smaller version of this also appears as a sidebar card on the dashboard ("Your rank"), showing rank/total and a status string — note the status text is a simple "#1 🎉" vs "Above avg" fallback, not an actual percentile calculation.

---

## 9. Activity feed ("Nudgeboard") — not currently reachable

The codebase includes a `Nudgeboard` component styled as a live team activity feed (teammates' wins, likes, etc.), but two things make it inert in the current build:

1. It is imported by the dashboard but never actually rendered — there is no path in the UI to reach it.
2. Even if it were rendered, the query behind it only ever fetches the **current user's own** feed events, not company-wide activity — so it could never show a teammate's action regardless.
3. The "Like" button on feed items is wired to a no-op function; nothing is persisted.

Treat this as a retired/unshipped feature rather than something to point users toward.

---

## 10. Timezone handling

All user-facing scheduling (accept times, reminder times, package delivery windows) operates in a **fixed IST offset (UTC+5:30)** — there is no per-user timezone setting and no daylight-saving handling. Times a user enters are always interpreted as IST and converted to UTC for storage. Note the weekly reminder's "time of day" is display copy only — the reminder email itself always sends on the daily cron's single run (see §5), not at the user's literal chosen time.

---

## 11. What's explicitly not present

To set expectations accurately: there is no profile/settings page for users to edit their own name or avatar, no real push/in-app notifications, no live calendar integration (only emailed invites), no "like" persistence on feed items, and no way to browse the full action library beyond what a package has assigned (the Challenges tab only shows skipped/failed items, not the whole bank).
