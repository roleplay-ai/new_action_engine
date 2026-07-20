# Data Model & Auth Internals

> Part of the Nudgeable Action Engine documentation set. See [README.md](./README.md) for the index and [00-architecture-overview.md](./00-architecture-overview.md) for the plain-language summary. This document is the technical reference: full schema (final state after all 20 migrations), RLS, functions/triggers, middleware, and cron config — for engineers maintaining the app.

---

## 1. Tables (final schema, after migrations 001–021)

Struck-through columns were added and later dropped by a later migration — they're listed so history in the migration files makes sense, but they don't exist in the current database.

### `companies`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | `gen_random_uuid()` |
| name | TEXT NOT NULL | |
| slug | TEXT UNIQUE | optional |
| created_by | UUID → `auth.users(id)` | |
| created_at / updated_at | TIMESTAMPTZ | |

### `profiles`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK → `auth.users(id)` ON DELETE CASCADE | 1:1 with auth user |
| full_name, avatar_url | TEXT | |
| company_id | UUID → `companies(id)` ON DELETE SET NULL | nullable |
| role | TEXT | `CHECK IN ('user','admin','superadmin')`, default `'user'` |
| league_index | INTEGER default 0 | 0=Starter … 4=Diamond |
| weekly_goal | INTEGER default 3 | |
| total_points | INTEGER default 0 | |
| streak | INTEGER default 0 | not observed to be incremented by any current server action |
| last_active_at, created_at | TIMESTAMPTZ | |
| persistent_login_key | UUID UNIQUE | added in 013; auto-generated on signup (014) |
| self_onboarding_completed_at | TIMESTAMPTZ | added in 021; `null` until the user completes (or skips) the self-serve AI onboarding wizard |

### `actions`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| company_id | UUID NOT NULL → `companies(id)` ON DELETE CASCADE | |
| created_by | UUID → `profiles(id)` | |
| theme | `action_theme` enum NOT NULL | |
| title, how, why | TEXT NOT NULL | |
| ~~points~~ | ~~INTEGER~~ | dropped in 017 |
| time_estimate | TEXT default `'5 mins'` | |
| is_system_action | BOOLEAN default false | |
| is_personal | BOOLEAN default false | added in 021; true for AI-generated/user-created personal actions — visible only to `created_by`, not the company-wide action bank (see RLS below) |
| created_at | TIMESTAMPTZ | |

### `user_actions`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID NOT NULL → `profiles(id)` ON DELETE CASCADE | |
| action_id | UUID NOT NULL → `actions(id)` ON DELETE CASCADE | |
| status | `action_status` enum, default `'scheduled'` | |
| scheduled_at | TIMESTAMPTZ | |
| ~~completed_reps~~ | ~~INTEGER~~ | dropped in 021 (habit-loop removal) |
| ~~reps_remaining~~ | ~~INTEGER~~ | dropped in 021 (habit-loop removal) |
| reflection | TEXT | |
| is_calendar_synced | BOOLEAN default false | |
| accepted_at | TIMESTAMPTZ | added in 009 |
| updated_at, created_at | TIMESTAMPTZ | |
| | | `UNIQUE(user_id, action_id)` — one row per user per action |

### `feed_events`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID NOT NULL → `profiles(id)` ON DELETE CASCADE | |
| action_title | TEXT NOT NULL | |
| type | `event_type` enum NOT NULL | |
| likes | INTEGER default 0 | never incremented by any current code path |
| created_at | TIMESTAMPTZ | |

Added to the `supabase_realtime` publication at the DB level (001), but no client code subscribes to it — see [00-architecture-overview.md](./00-architecture-overview.md#6-known-dead-code--inert-features).

### `packages`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| company_id | UUID NOT NULL → `companies(id)` ON DELETE CASCADE | |
| created_by | UUID → `profiles(id)` | |
| name | TEXT NOT NULL | |
| description | TEXT | present, not surfaced in the UI |
| ~~skill_theme~~ | ~~TEXT~~ | dropped in 018 |
| start_date | DATE | |
| duration_weeks | INTEGER default 8 | |
| ~~actions_per_week~~ | ~~INTEGER~~ | dropped in 016 |
| delivery_time | TIME | fallback activation time |
| ~~rule_of_five~~ | ~~INTEGER~~ | dropped in 016 — the real "rule of 5" is hardcoded in validation logic, not configurable per package |
| ~~points_weight~~ | ~~INTEGER~~ | dropped in 016 |
| created_at | TIMESTAMPTZ | |

### `package_actions`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| package_id | UUID NOT NULL → `packages(id)` ON DELETE CASCADE | |
| action_id | UUID NOT NULL → `actions(id)` ON DELETE CASCADE | |
| week_number | INTEGER | |
| sort_order | INTEGER default 0 | |
| delivery_date | DATE | added in 010 |
| delivery_time | TIME | added in 011 |
| created_at | TIMESTAMPTZ | |
| | | `UNIQUE(package_id, action_id)` |

### `package_assignments`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| package_id | UUID NOT NULL → `packages(id)` ON DELETE CASCADE | |
| user_id | UUID NOT NULL → `profiles(id)` ON DELETE CASCADE | |
| scheduled_start_date | DATE | |
| created_at | TIMESTAMPTZ | |
| | | `UNIQUE(package_id, user_id)` |

### `action_reminders` — added in 021, replaces `habit_occurrences`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID NOT NULL → `profiles(id)` ON DELETE CASCADE | |
| user_action_id | UUID NOT NULL → `user_actions(id)` ON DELETE CASCADE | |
| action_id | UUID NOT NULL → `actions(id)` ON DELETE CASCADE | |
| times_per_week | INTEGER NOT NULL, `CHECK BETWEEN 1 AND 7` | user-declared intent, not enforced/tracked per occurrence |
| time_of_day_utc | TEXT default `'03:30'` | intended time of day, IST→UTC converted; display copy only, not a literal send time |
| is_active | BOOLEAN default true | |
| next_run_at | TIMESTAMPTZ NOT NULL | next Monday (IST-anchored); advanced +7 days after each send |
| last_sent_at | TIMESTAMPTZ | |
| created_at, updated_at | TIMESTAMPTZ | |
| | | `UNIQUE(user_action_id)` — one standing reminder per accepted action |

Indexed on `(next_run_at, is_active)` and `(user_id)`. RLS: user owns/CRUDs their own rows.

### `action_reminder_completions` — added in 021
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| reminder_id | UUID NOT NULL → `action_reminders(id)` ON DELETE CASCADE | |
| user_id | UUID NOT NULL → `profiles(id)` ON DELETE CASCADE | |
| week_start_date | DATE NOT NULL | Monday of the ISO week (IST) being marked done |
| completed_at | TIMESTAMPTZ default now() | |
| | | `UNIQUE(reminder_id, week_start_date)` — one "mark done" per reminder per week |

Lightweight replacement for the old rep-counter — no cementing threshold, just a per-week log. Each row also awards +5 XP (same as a validated success) via `syncMyTotalPointsFromHistory()`.

### `auto_login_logs` — service-role only (013)
`id, user_id → auth.users ON DELETE SET NULL, ip_address, user_agent, success BOOLEAN NOT NULL default true, created_at`. RLS: `USING (false) WITH CHECK (false)` — no client access at all, ever.

### `email_campaign_logs` — service-role only (015)
`id, user_id → auth.users ON DELETE SET NULL, email, template_id, status default 'sent', error_message, sent_by → auth.users ON DELETE SET NULL, created_at`. Same deny-all RLS.

### `email_schedules` — service-role only (019)
`id, name, template_id, user_ids UUID[] default '{}', schedule_type CHECK IN ('daily','weekly','every_n_days','specific_date'), interval_days, run_time_utc TEXT default '09:00', specific_run_at, next_run_at NOT NULL, last_run_at, last_run_status, last_run_sent default 0, last_run_failed default 0, is_active default true, created_by → auth.users ON DELETE SET NULL, created_at, updated_at`. Indexed on `(next_run_at, is_active)`. Same deny-all RLS.

### `user_credential_delivery` — service-role only (020)
`user_id PK → auth.users ON DELETE CASCADE, email, plaintext_password NOT NULL, created_at`. RLS enabled with **zero policies defined** (not even a deny-all `USING(false)` — just no grants at all, which has the same net effect: nothing but the service-role key can touch it). The migration's own comment flags plaintext password storage as sensitive.

---

## 2. Enum types

Defined once in migration 001; never extended afterward (confirmed — no `ALTER TYPE ... ADD VALUE` anywhere in the migration set):

- **`action_theme`**: `Collaboration`, `Feedback`, `Accountability`, `Connection`, `Coaching`
- **`action_status`**: `scheduled`, `success`, `failed`, `skipped`, `habit_started`, `cemented` — the last two are **vestigial**: Postgres can't cheaply drop enum values, so they remain defined, but no code path has produced them since the 021 habit-loop removal. The TypeScript type layer (`lib/types.ts`) only lists `'scheduled' | 'success' | 'failed' | 'skipped'` going forward.
- **`event_type`**: `ACCEPTED`, `SUCCESS`, `HABIT_STARTED`, `CEMENTED`, `DECLINED` — `HABIT_STARTED`/`CEMENTED` are similarly vestigial post-021. The type layer also lists `READ`/`SCHEDULED`, but no code path currently inserts either.

`email_schedules.schedule_type` and the various `status` text columns are plain `TEXT` with `CHECK` constraints, not real Postgres enum types.

---

## 3. Role model

Single-column model: `profiles.role`, `CHECK IN ('user','admin','superadmin')`. No separate roles/permissions tables, no multi-role-per-user support.

**Enforcement is layered, and Postgres RLS is not the primary gate for the admin/superadmin panels**:

1. **Middleware** (`middleware.ts` + `lib/supabase/middleware.ts`) — session-presence only. Redirects unauthenticated users to `/login`; redirects authenticated users away from `/login`. Does **not** check `role`, so an authenticated `user` can reach `/admin`'s URL at the middleware layer — the actual block happens one layer deeper.
2. **Layout/page level** — every admin/superadmin route independently fetches `profiles.role` and `redirect("/")`s on mismatch.
3. **Server-action level** — every privileged server action re-derives role again before reading/writing data, via locally-duplicated helpers (`ensureCompanyAdmin()`, `ensureSuperadmin()`, `getCallerAdminForCompany()` — not a single shared module).
4. **RLS policies** — a real backstop for direct/anon client access, using two `SECURITY DEFINER` helper functions (`current_user_role()`, `current_user_company_id()`, added in migration 008 specifically to avoid RLS self-recursion when a policy on `profiles` needs to check `profiles.role`).

**Superadmin email fallback**: `SUPERADMIN_EMAIL` env var (default `admin@actionengine`) is treated as superadmin even if `profiles.role` isn't yet `'superadmin'`, in both the layout gate and `ensureSuperadmin()`. This is a deliberate anti-lockout measure per in-code comments, not an oversight — but it does mean anyone controlling that mailbox has an authorization path independent of the `role` column.

---

## 4. RLS policy summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| companies | own company, or superadmin | superadmin only | superadmin only | superadmin only |
| profiles | self; company admin/superadmin can read same-company profiles | open `WITH CHECK(true)` (relies on the signup trigger / service role in practice) | self; superadmin any row | none |
| actions | same company AND (not personal, or own personal row), or superadmin | company admin (own company) or superadmin; **or** any user inserting their own `is_personal=true` row | same (admin/superadmin only — personal rows have no UPDATE policy for their creator) | same (admin/superadmin only) |
| user_actions | self | self, or company admin/superadmin inserting for their company's users | self, or company admin/superadmin | self only |
| feed_events | anyone (`USING(true)`) | self only | none | none |
| packages | own company, or superadmin | company admin (own company) or superadmin | same | same |
| package_actions | via parent package's company, or superadmin | company admin/superadmin of parent's company | same | same |
| package_assignments | via parent package's company, or superadmin | company admin/superadmin of parent's company | same | same |
| action_reminders | self | self | self | self |
| action_reminder_completions | self | self | self | self |
| auto_login_logs | none (deny-all) | none | none | none |
| email_campaign_logs | none (deny-all) | none | none | none |
| email_schedules | none (deny-all) | none | none | none |
| user_credential_delivery | none (no policies) | none | none | none |

All four deny-all tables are written/read exclusively through the service-role admin client, which bypasses RLS entirely — that's by design for these specific tables (they hold audit logs and sensitive credentials that should never be client-readable).

---

## 5. Functions & triggers

- **`handle_new_user()`** (001, redefined 014) — `SECURITY DEFINER` trigger function. Fires `AFTER INSERT ON auth.users` (trigger `on_auth_user_created`). Creates the matching `profiles` row (`full_name`/`avatar_url` from auth metadata, `company_id: null`, `role: 'user'`). As of migration 014, also assigns a fresh `persistent_login_key`. This is the sole mechanism that guarantees every auth user has a profile — the admin/superadmin "create user" server actions then `upsert` on top of whatever this trigger produced to set the real role/company.
- **`current_user_role()`**, **`current_user_company_id()`** (008) — `SECURITY DEFINER STABLE` helper functions used inside RLS policies to read the caller's own role/company without triggering RLS recursion on `profiles`.
- No `pg_cron` or other database-side scheduling exists — all scheduling is Vercel Cron hitting Next.js API routes (see §7).
- No dedicated "generate auto-login token" database function — the auto-login flow is implemented entirely in application code using the static `persistent_login_key` column plus Supabase Admin's `generateLink({type: "magiclink"})` API at request time (see §6).

---

## 6. Auth flow, end to end

**No self-serve signup exists.** Accounts are created only via `superadmin.ts:createUser()` or `admin-users.ts:createCompanyUser()`, both of which call Supabase Admin's `createUser` (pre-confirmed, no verification email), then upsert the `profiles` row (role/company/`persistent_login_key`), then store the plaintext password for later credential-email use. The `handle_new_user()` trigger also fires regardless, but its defaults get overwritten by these explicit upserts.

**Password login**: `/login` → `supabase.auth.signInWithPassword()` (browser client) → full-page redirect to `/`, where `app/(app)/page.tsx` does the role-based routing.

**Session/cookies**: standard `@supabase/ssr` cookie-based JWT session, refreshed on every request by the middleware's `updateSession()`.

**Auto-login (permanent link)**:
1. `profiles.persistent_login_key` — a permanent UUID, assigned at profile creation, rotatable by a superadmin.
2. `GET /api/auto-login?key=<uuid>` — looks up the profile by key (service-role client, bypasses RLS), fetches the user's email, calls Supabase Admin's `generateLink({type:"magiclink"})` to mint a genuine short-lived token, and redirects to Supabase's own verify URL. Every attempt is logged to `auto_login_logs` regardless of outcome.
3. Supabase's verify step redirects to `/auth/callback#access_token=...&refresh_token=...` (tokens in the URL hash fragment, not a query string).
4. `/auth/callback` (client component) reads the hash, calls `supabase.auth.setSession(...)`, then hard-redirects to `/`.

This `persistent_login_key`-based URL is what gets embedded as the `login_url` in essentially every system email (weekly digest, auto-login send, credential email) — it's the platform's default "click to get in" mechanism. The separate credential-email flow instead sends the literal password plus a link to the ordinary `/login` page, for cases where password-based access is wanted.

**Logout**: `supabase.auth.signOut()`, then a redirect to `/login`.

---

## 7. Cron jobs

`vercel.json` registers exactly one cron:

```json
{ "crons": [ { "path": "/api/cron/email-scheduler", "schedule": "30 4 * * *" } ] }
```

That's **once daily at 04:30 UTC (10:00 AM IST)**. (Some in-app UI copy and a code comment describe a different cadence — those are stale; trust this config, not the copy.)

- **`/api/cron/email-scheduler`** — the only cron doing real work, now with two phases. Auth via `Authorization: Bearer <CRON_SECRET>` or a `?secret=` query param (skipped if `CRON_SECRET` isn't set).
  1. Finds due `email_schedules` rows, sends via the shared Resend helper (logging each send to `email_campaign_logs`), advances `next_run_at`, and deactivates one-time (`specific_date`) schedules after they fire.
  2. Finds due `action_reminders` rows (added in 021), groups them by user, sends **one summary email per user** via `SENDGRID_ACTION_REMINDER_TEMPLATE_ID` (only if that env var is set), and advances each reminder's `next_run_at` by 7 days. Since this cron only fires once daily, "weekly on Monday" is achieved by anchoring `next_run_at` to Monday 00:00 IST — the reminder's user-chosen "time of day" is display copy in the email, not a literal send time.
- **`/api/cron/package-activation`** — present in the codebase but an explicit no-op, and not even registered in `vercel.json`. Package delivery/visibility is computed client-side at query time (see [00-architecture-overview.md](./00-architecture-overview.md#4-high-level-data-flow)), so nothing needs to run on a schedule to "activate" a package action — this route is a historical leftover.

Both cron routes are excluded from the auth middleware's matcher (`middleware.ts`) — they authenticate themselves via `CRON_SECRET` rather than a Supabase session, since Vercel's cron invoker has no user session to present.

---

## 8. Security-relevant design notes worth keeping in mind

- **Plaintext passwords are stored** in `user_credential_delivery` for every admin/superadmin-created user, indefinitely (never auto-deleted), specifically so credentials can be resent. It's protected by having no RLS policies at all (service-role only), but it is a real plaintext-credential-at-rest design choice, not an oversight to silently "fix" without checking with the team first.
- **Admin/superadmin authorization is enforced primarily in application code**, not the database — the service-role client used throughout those panels bypasses RLS. A bug in one of the hand-written `role === 'admin' ? ... : ...` checks would not necessarily be caught by RLS on tables where a matching policy already grants admin-shaped access (`profiles`, `actions`, `packages`). The genuinely RLS-protected tables are the four deny-all ones in §4.
- **`SUPERADMIN_EMAIL`** is a standing authorization bypass independent of the `role` column — anyone who can authenticate as that exact email is treated as superadmin regardless of their `profiles.role`.
