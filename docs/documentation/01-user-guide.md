# User Guide (role: `user`)

> Part of the Nudgeable Action Engine documentation set. See [README.md](./README.md) for the index and [00-architecture-overview.md](./00-architecture-overview.md) for cross-cutting concepts (roles, auth, dead code). This document is technical + feature-level: it describes what a regular end user can do, and cites the exact code behind it.

---

## 1. Getting in

There is no self-serve signup. An account is created for a user by a [company admin](./02-admin-guide.md#user-management) or [superadmin](./03-superadmin-guide.md#global-user-management), who sets an initial email + password and assigns a `company_id`. The user then reaches the app one of three ways:

- **Password login** at `/login` — `supabase.auth.signInWithPassword()` (`app/(auth)/login/page.tsx:15-32`), then a full page redirect to `/`.
- **Auto-login link** — a permanent, one-click link (`{app}/api/auto-login?key=<uuid>`) embedded in system emails (weekly digest, credential email, admin-sent login email). Clicking it logs the user in without a password. See [03-superadmin-guide.md](./03-superadmin-guide.md#auto-login--credential-delivery) for the mechanics.
- **Credential email** — an email containing the user's actual (plaintext) password and a link to the normal `/login` page, sent by a company admin from their Email Management screen.

On every visit, `app/(app)/page.tsx:5-27` looks up the caller's `profiles.role` and routes them: `superadmin` → `/superadmin`, `admin` → `/admin`, anything else → the regular dashboard described below.

**There is no onboarding flow.** `components/Onboarding.tsx` exists in the codebase but is never rendered, and its submit handler is a no-op — a brand-new user lands straight on the dashboard with default profile values (0 points, Starter league, 0 streak) until real data loads.

**No company yet**: if a user's `profiles.company_id` is null (created but not yet assigned to a company), the dashboard and challenge library show a "Not assigned to a company — contact your admin" placeholder instead of content.

**Logout**: the navbar logout button calls `supabase.auth.signOut()` and redirects to `/login`.

---

## 2. Layout & navigation

The app shell (`components/Layout.tsx`) exposes exactly three tabs:

| Tab | Content |
|---|---|
| **Dashboard** (`home`) | Today's queue, habit tracker, action carousels — see §3 |
| **Challenges** (`challenges`) | Retry queue for skipped/failed actions — see §4 |
| **Progress** (`progress`) | Personal analytics + leaderboard — see §8 |

The navbar also shows a 🔥 streak badge (sourced from `profiles.streak` — see the caveat in [00-architecture-overview.md](./00-architecture-overview.md#6-known-dead-code--inert-features), it does not appear to be incremented anywhere) and a notification bell that simply switches to the Dashboard tab (there is no real notification system behind it).

---

## 3. Dashboard

The dashboard (`app/(app)/dashboard-client.tsx`) pulls together every action assigned to the user through their company's [packages](./02-admin-guide.md#package-management), sorted into a few working sets:

- **Available actions carousel** — actions from an *activated* package assignment that the user hasn't yet interacted with. A package action is "activated" once its scheduled delivery date/time has passed by at least one minute (a small grace window baked into the query in `lib/store.tsx`).
- **Validation queue** — actions the user scheduled whose time has arrived, waiting to be marked done or not.
- **Habit rep queue** — due `habit_occurrences` for actions currently in an active habit loop.
- **Habit carousel** — actions in `habit_started` or `cemented` status, shown with a 5-segment progress bar.

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

Once a scheduled/accepted action's time has passed, it shows up in the validation queue. Tapping it opens a modal that walks through a small state machine:

1. **Reflection prompt** — a free-text box ("What was the tactical result or friction point?"), then either **Verify Rep** (success) or **Didn't Complete** (failure).
2. **Celebration screen** (success only) — confetti animation. Note: the on-screen "+50 XP" badge here is decorative copy, not the real point award (see §7).
3. **Habit nudge** (first-ever success on this action only) — "1 success down, 4 reps to cement," with the option to **Start Habit Loop** or finish for today without committing to reps.
4. **Habit scheduling** (if starting the loop) — choose a cadence, **Daily** (next 4 consecutive days) or **Weekly** (same weekday, next 4 weeks), and a time of day.
5. **Confirmation screen** — a closing celebratory animation.

Both success and failure are recorded via the `validateAction` server action.

---

## 4. Challenges (retry queue)

Despite the "library" framing, the Challenges tab (`components/Challenges.tsx`) is **not** a general browse-all-actions screen — it deliberately only surfaces actions the user has previously **skipped** or marked **"Didn't complete."** It's a second-chance queue, with a search box (matches title/theme) and filter chips (All / Skipped / Didn't complete). Re-accepting from here shows a "Plan again" button instead of "Accept," but goes through the same scheduling flow as §3.

---

## 5. Habit loop ("Rule of 5")

An action becomes a repeatable habit the first time it's successfully validated. From there:

| Event | Status becomes | Reps remaining |
|---|---|---|
| First success from `scheduled` | `habit_started` | 4 |
| Each subsequent success | stays `habit_started` | −1 each time |
| 5th total success | `cemented` | 0 (habit "locked in") |
| Any failed validation, at any point | `failed` | unchanged |

Starting a habit loop schedules exactly **4 upcoming reps** (`habit_occurrences` rows) — daily (next 4 consecutive days) or weekly (same weekday, next 4 weeks) — at the time the user chose. Each due occurrence surfaces in the dashboard's habit rep queue; validating it advances the counter above. Once `cemented`, the action's progress bar shows "5/5 complete — Habit acquired."

---

## 6. Points / XP

All points are computed and written **server-side only** — nothing on the client calculates or persists XP. The real, canonical values (`lib/points.ts`):

| Event | XP | Notes |
|---|---|---|
| Reading (first time an action gets a `user_actions` row) | +1 | One-time per action |
| Accept / schedule | +3 (or +5 with calendar sync) | One-time per action |
| Decline ("honesty skip") | +1 | One-time per action |
| Successful validation | +5 | Every success, including habit reps |
| First success (starts habit loop) | +7 extra | On top of the +5 above, so the first success nets +12 |
| Cementing success (5th rep) | +10 extra | On top of the +5 above, so the cementing success nets +15 |
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

- **Behavioral Transition Funnel** — Knowledge / Intention / Action / Habit percentages, derived from how many of the user's assigned actions have reached each stage.
- **Current Level card** — league badge, points, and how many points away from the next league.
- **Achievement Wall** — the five league badges, current one highlighted.
- **Phase breakdown** — counts of Received / Read / Accepted / Skipped / Validated / Failed / Ongoing (habit) / Acquired (cemented) actions.
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

All user-facing scheduling (accept times, habit rep times, package delivery windows) operates in a **fixed IST offset (UTC+5:30)** — there is no per-user timezone setting and no daylight-saving handling. Times a user enters are always interpreted as IST and converted to UTC for storage.

---

## 11. What's explicitly not present

To set expectations accurately: there is no profile/settings page for users to edit their own name or avatar, no real push/in-app notifications, no live calendar integration (only emailed invites), no "like" persistence on feed items, and no way to browse the full action library beyond what a package has assigned (the Challenges tab only shows skipped/failed items, not the whole bank).
