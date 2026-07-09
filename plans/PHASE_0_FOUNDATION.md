# Phase 0: Foundation (multi-tenant)

**Planning source:** [PRODUCT_GUIDE.md](../PRODUCT_GUIDE.md) | **Multi-tenant:** [docs/MULTI_TENANT_DESIGN.md](../docs/MULTI_TENANT_DESIGN.md) | **Overview:** [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md)

**Goal:** Next.js-only app, Supabase connected, base schema **with companies and company-scoped profiles/actions**, Auth and profile creation, protected routes. Seed one company and initial Action Library for that company.

---

## 0.1 Project setup

- Consolidate on Next.js 15 (single `npm run dev` = Next.js).
- Dependencies: `@supabase/supabase-js`, `@supabase/ssr`.
- Environment: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Visual language (Product Guide):** Tailwind + [app/globals.css](../app/globals.css) – Neo-Brutalism.

## 0.2 Supabase project and base schema (multi-tenant)

**Companies first (so profiles and actions can reference them):**

```sql
CREATE TABLE companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Profiles (extend with company_id and role):**

- `profiles`: id (FK auth.users), full_name, avatar_url, **company_id** (FK companies, nullable), **role** (`'superadmin' | 'admin' | 'user'`), league_index, weekly_goal, total_points, streak, last_active_at, created_at.
- Superadmin: `role = 'superadmin'`, `company_id` null.
- Company admin: `role = 'admin'`, `company_id` = their company.
- User: `role = 'user'`, `company_id` = their company.

**Actions (company-scoped):**

- `actions`: id, **company_id** (FK companies, NOT NULL so every action belongs to a company), created_by, theme, title, how, why, points, time_estimate, is_system_action, created_at.

**Rest of base schema (unchanged):**

- `action_theme` enum, `action_status` enum, `user_actions` table.
- `event_type` enum, `feed_events` table.
- Realtime: `alter publication supabase_realtime add table feed_events;`

**RLS (multi-tenant):**

- **companies:** Superadmin: full access. Company admin: read own company. User: read own company.
- **profiles:** Read/update own; superadmin can update any (assign company_id, role); company admin can read profiles where company_id = their company_id.
- **actions:** Read by users where action.company_id = user’s company_id. Insert/update/delete by company admin for that company (profile.company_id = action.company_id) or superadmin.
- **user_actions:** CRUD own (user_id = auth.uid()).
- **feed_events:** Read all (later filter by company in app); insert own.

## 0.3 Auth and profiles

- Supabase Auth: sign-up/sign-in (email+password or OAuth).
- On first sign-in: insert or update `profiles` (id from auth.users, full_name, etc.). New users: `company_id` null, `role` 'user' until superadmin assigns them to a company.
- Middleware: protect app routes; redirect unauthenticated to login.
- Layout: auth-aware layout; show user name and logout. If user has no company_id, show “Not assigned to a company” or restrict to minimal UI until assigned.

## 0.4 Seed data

- Seed **one company** (e.g. “Demo Company”).
- Seed **actions** for that company (Action Library from [lib/constants.ts](../lib/constants.ts) ACTION_DECK); set `company_id` = seeded company id.
- (Optional) Create one superadmin user and one company admin user in DB for testing.

---

## Deliverables

- Next.js-only app, Supabase connected.
- **companies** table; **profiles** with company_id, role; **actions** with company_id.
- RLS for companies and company-scoped actions/profiles.
- Auth + profile creation, protected routes.
- One seeded company and seeded Action Library for that company.

---

## File and folder hints

- `lib/supabase/server.ts`, `lib/supabase/client.ts`, `middleware.ts`, `app/(auth)/login/page.tsx`, `app/(app)/layout.tsx`, `supabase/migrations/001_base_schema.sql` (include companies and company_id/role/company_id columns).

---

**Next:** [PHASE_1_ACTION_ENGINE.md](PHASE_1_ACTION_ENGINE.md)
