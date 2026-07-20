# Architecture Overview

> Part of the Nudgeable Action Engine documentation set. See [README.md](./README.md) for the full index.
>
> **Scope & method**: this documentation set describes the app **as actually implemented in the current codebase**, verified by reading source files and all 20 Supabase migrations directly — not the earlier planning documents (`PRODUCT_GUIDE.md`, `ENGINE_BLUEPRINT.md`, `docs/MULTI_TENANT_DESIGN.md`, `plans/*.md`), which describe an earlier design and are in places aspirational or stale. Every discrepancy between those planning docs and the real implementation is called out explicitly where relevant.

---

## 1. What the app is

Nudgeable Action Engine is a B2B behavior-change platform. Companies (tenants) enroll their employees ("users"); a **company admin** curates a library of "micro-actions" and bundles them into scheduled **packages**; end users accept, schedule, and validate those actions. Separately, a user can self-generate their own personal actions via an AI onboarding wizard (Gemini Flash, based on two questions about their training) and opt into a standing weekly reminder email instead of the old in-app "habit loop" rep-tracking. A **superadmin** manages the companies and users across the whole platform and operates the email/login infrastructure.

## 2. Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router), TypeScript |
| Auth & DB | Supabase (Postgres + Supabase Auth), `@supabase/ssr` cookie sessions |
| Styling | Tailwind CSS ("Neo-Brutalist" visual language — bold borders, high contrast) |
| Email | Resend (`resend`), code-defined HTML templates ([lib/email-templates.ts](../../lib/email-templates.ts)) |
| Scheduling | Vercel Cron (one job — see [04-data-model.md](./04-data-model.md#cron-jobs)) |
| Charts | Recharts (admin analytics) |

There is also a **legacy Vite/React prototype** left in the repo root (`App.tsx`, `index.tsx`, `index.html`, `vite.config.ts`, root `store.tsx`, root `constants.tsx`, root `types.ts`, `components/AdminDashboard.tsx`, `components/Analytics.tsx` is NOT legacy — see note below, `components/Onboarding.tsx`, `components/Sidebar.tsx`). `package.json` only defines `next dev|build|start` scripts — there is no Vite script — so **none of this legacy tree runs in the shipped product**. It is called out throughout this documentation only so it isn't mistaken for a real feature.

## 3. Roles & multi-tenancy

Three roles, stored in a single column `profiles.role` (`CHECK IN ('user','admin','superadmin')`) — there is no separate roles/permissions table:

| Role | Scope | Panel |
|---|---|---|
| **user** | One company (`profiles.company_id`) | Main app (dashboard, challenges, progress) — [01-user-guide.md](./01-user-guide.md) |
| **admin** (company admin) | One company, pinned server-side to their own `company_id` | `/admin` — [02-admin-guide.md](./02-admin-guide.md) |
| **superadmin** | Global, no `company_id` | `/superadmin` — [03-superadmin-guide.md](./03-superadmin-guide.md) |

Tenancy root is the `companies` table. Everything else — `actions`, `packages`, `package_actions`, `package_assignments` — hangs off a `company_id`. A user's `profiles.company_id` determines which company's content they see. Full schema in [04-data-model.md](./04-data-model.md).

### How role is enforced

There is **no role-based logic in `middleware.ts`** — the root middleware only checks whether a Supabase session exists (redirects unauthenticated users to `/login`, and authenticated users away from `/login`). Role gating happens **after** middleware, independently, in two places for every privileged route/action:

1. **Page/layout level** — every admin/superadmin route file re-fetches `profiles.role` and calls `redirect("/")` if it doesn't match. This check is copy-pasted per file (no shared route-guard component).
2. **Server-action level** — every privileged server action re-derives the caller's role again (`ensureCompanyAdmin()`, `ensureSuperadmin()`, `getCallerAdminForCompany()` — each duplicated across a few files rather than a single shared helper) before touching data. For an `admin`, the `company_id` used in a query is **always** the value read server-side from their own profile — a `companyId` sent from the client is ignored/overridden, so a tampered request can't cross tenant boundaries.

There is also a hardcoded escape hatch: `SUPERADMIN_EMAIL` (env var, default `admin@actionengine`) is treated as superadmin **even if `profiles.role` hasn't been synced yet** — this exists specifically to avoid a redirect-loop lockout for the seeded superadmin account. See [04-data-model.md](./04-data-model.md#role-model).

### Where authorization actually lives: app code, not RLS

Admin and superadmin server actions read/write mostly through a **service-role Supabase client** (`createAdminClient()`, `lib/supabase/admin.ts`) which bypasses Row-Level Security entirely. This means Postgres RLS is a defense-in-depth backstop for direct client access, but the real gate for the admin/superadmin panels is the hand-written role checks described above — a bug in one of those checks would not necessarily be caught by RLS on tables where a matching admin policy already exists (e.g. `profiles`, `actions`, `packages`). A handful of sensitive tables (`user_credential_delivery`, `email_schedules`, `email_campaign_logs`, `auto_login_logs`) have **no RLS policies granting any client access at all** — service role only — so those are protected regardless of application-level bugs.

## 4. High-level data flow

```
companies
   └─ profiles (role, company_id)
   └─ actions (company's action library)
        └─ package_actions (which actions, which week / delivery date+time)
   └─ packages (curated, scheduled programs)
        └─ package_assignments (which users are enrolled, start date)
             └─ user_actions (one row per user × action: status, reflection)
                   └─ action_reminders (weekly reminder cadence, one row per user_actions row)
                         └─ action_reminder_completions ("mark done" per ISO week)
   └─ feed_events (per-user activity log; realtime-enabled at the DB level, not used by any live UI today)
```

A package's actions become visible to an enrolled user once the computed "activation" time (delivery date/time, falling back to the package start date + week offset and a default fallback time) has passed. **This activation check happens entirely client-side, at query time** — there is no server-side job that materializes `user_actions` rows on a schedule. A `user_actions` row is only created once the user actively accepts, schedules, or declines an action.

## 5. Auth & login mechanisms (summary)

There is **no self-serve signup** — accounts are created only by a company admin or superadmin via server actions. Three ways into a session:

1. **Password login** — `/login`, standard Supabase `signInWithPassword`.
2. **Auto-login (permanent link)** — every profile has a non-expiring `persistent_login_key` (UUID). Visiting `/api/auto-login?key=<uuid>` exchanges it server-side for a genuine short-lived Supabase magic link and logs the user in. This is the link embedded in most system emails.
3. **Credential email** — a separate flow that emails the user's actual (plaintext, stored) password plus a link to the normal `/login` page, for users who need password-based access.

Full details in [03-superadmin-guide.md](./03-superadmin-guide.md#auto-login--credential-delivery) and [04-data-model.md](./04-data-model.md#auth-flow-end-to-end).

## 6. Known dead code / inert features (read this before trusting any file you find)

The codebase contains several components and functions that exist, compile, and are sometimes even imported — but are never actually reachable or never actually change persisted data. Documenting these explicitly avoids someone (human or AI) "fixing" or relying on something that was already quietly retired:

| Item | State |
|---|---|
| Root `store.tsx`, `App.tsx`, `index.tsx`, `index.html`, `vite.config.ts`, root `constants.tsx`, root `types.ts` | Entire legacy Vite prototype; not run by `next dev/build/start`. |
| ~~`components/Onboarding.tsx`~~ | **No longer dead** — this is now the self-serve AI action onboarding wizard, shown once per user (gated on `profiles.self_onboarding_completed_at`). |
| `components/Sidebar.tsx` | Never rendered in the real dashboard; contains hardcoded fake competitor names. |
| `components/Nudgeboard.tsx` | Imported by the dashboard but never actually rendered in JSX — unreachable. Also, even if rendered, its data would only ever contain the *current user's own* events (see below), not a team feed. |
| `lib/google-calendar.ts` | Unused. Real "calendar sync" is an emailed `.ics` attachment + a Google Calendar template link, not a live OAuth calendar integration. |
| `likeFeedItem()` (`lib/store.tsx`) | No-op stub; there is no "like" server action or table. |
| Supabase Realtime | `feed_events` is added to the `supabase_realtime` publication at the DB level, but no code anywhere subscribes to a realtime channel — all feed/leaderboard data is fetched via one-shot queries. |
| `profiles.streak` | Read and displayed in several places (navbar, analytics, weekly email) but no code path was found that increments it for a regular user action — it appears dormant. |
| "+50 XP" badge on the success-celebration screen | Purely decorative copy; the real award is +5 (or +5+7 / +5+10, see [01-user-guide.md](./01-user-guide.md#points--xp)). |
| `getRedirectPathAfterLogin()` (`app/actions/auth.ts`) | Defined but not called by the login page; role-based redirect is actually done by `app/(app)/page.tsx`. |
| `assignUserToCompany`, `removeUserFromCompany`, `setCompanyAdmin`, `removeCompanyAdmin` (`app/actions/superadmin.ts`) | Implemented, matching the old planning doc almost verbatim, but **no UI calls them** — the shipped superadmin UI uses one consolidated `updateUserBySuperadmin` action instead. |
| `addActionsToPackage()` (`app/actions/packages.ts`) | Superseded by `configurePackageDeliveries()`, which is what the current package wizard actually calls. |
| `app/api/cron/package-activation` | Explicit no-op, kept only for compatibility; not registered in `vercel.json`, so nothing invokes it. |
| "Download Report" (admin dashboard) and "Nudge Strategy" (inactive-users card) buttons | No handler wired — decorative. |
| "Rule of five" / `actions_per_week` fields on packages | Described in the old planning doc as package columns; **do not exist** in the schema. The in-app "Rule of 5" rep-loop/cementing mechanic itself has also been removed from the codebase (replaced by weekly `action_reminders`); the `action_status` enum still contains unused `habit_started`/`cemented` values for historical-data compatibility, but the app never produces them anymore. |
| `components/AdminDashboard.tsx`, `components/Analytics.tsx` (root-level, imported only by the legacy `App.tsx`) | Not part of the live admin panel — the real admin UI is `components/admin/views/*`. Note: `components/Analytics.tsx` in the **user-facing** "Progress" tab is a *different* real, live component — only the root-import path via `App.tsx` is dead. |

## 7. Document index

- [01-user-guide.md](./01-user-guide.md) — regular user experience
- [02-admin-guide.md](./02-admin-guide.md) — company admin panel
- [03-superadmin-guide.md](./03-superadmin-guide.md) — superadmin panel
- [04-data-model.md](./04-data-model.md) — full database schema, RLS, auth internals, cron
