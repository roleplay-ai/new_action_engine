# Supabase Database Setup Guide

This guide helps you set up Supabase for the **Nudgeable Action Engine** (Phase 0 foundation: multi-tenant schema, auth, profiles).

## Prerequisites

1. A [Supabase](https://supabase.com) account
2. A new Supabase project

## Step 1: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in
2. Click **New Project**
3. Fill in:
   - **Name:** `nudgeable-action-engine` (or your preferred name)
   - **Database Password:** Choose a strong password (save it)
   - **Region:** Closest to your users
4. Wait for the project to be created (a few minutes)

## Step 2: Get Your Supabase Credentials

1. In the project dashboard, go to **Settings** → **API**
2. Copy:
   - **Project URL** → use as `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → use as `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key (optional, for admin/scripts) → use as `SUPABASE_SERVICE_ROLE_KEY` — **keep this secret**

## Step 3: Environment Variables

1. In the project root, create `.env.local` (or copy from `.env.local.example`)
2. Add:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Optional: server-side only (e.g. migrations or superadmin scripts)
# SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

**Important:** Do not commit `.env.local`; it is in `.gitignore`.

## Step 4: Run Database Migrations

Run migrations in order so the schema and seed data are applied.

### Option A: Supabase CLI (recommended)

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Log in:
   ```bash
   supabase login
   ```

3. Link your project (use the ref from the project URL: `https://supabase.com/dashboard/project/[project-ref]`):
   ```bash
   supabase link --project-ref your-project-ref
   ```

4. Push migrations:
   ```bash
   supabase db push
   ```

### Option B: Supabase Dashboard SQL Editor

1. In the dashboard, open **SQL Editor**
2. Run each migration file in order:
   - **001_base_schema.sql** — companies, profiles, actions, user_actions, feed_events, RLS, trigger
   - **002_seed_actions.sql** — Demo Company + Action Library seed
   - **003_optional_test_roles.sql** — no-op; file contains commented examples for test roles
3. For each file: New query → paste contents → **Run**

**Important:** Run 001 → 002 → 003 in that order.

## Step 5: Enable Email Login (REQUIRED)

If you see **"Email logins are disabled"** when logging in, enable the Email provider:

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. Click **Authentication** in the left sidebar
3. Click **Providers**
4. Find **Email** and click it
5. **Turn ON** "Enable Email provider" (or ensure it's enabled)
6. **Turn OFF** "Enable Email Signup" if you want admin-only user creation (users can still log in; they just can't self-register)
7. Click **Save**

**Important:** The Email provider must be **enabled** for users to log in. "Enable Email Signup" only controls whether new users can create accounts—turning it off does NOT disable login for existing users.

## Step 6: Verify Setup

1. **Tables**  
   In **Table Editor**, confirm:
   - `companies`
   - `profiles` (with `company_id`, `role`)
   - `actions` (with `company_id`)
   - `user_actions`
   - `feed_events`

2. **RLS**  
   Open any table → **Policies** and confirm RLS policies are present.

3. **Seed data**  
   - `companies`: one row (e.g. Demo Company, slug `demo-company`)
   - `actions`: six rows for that company

4. **App**  
   From project root:
   ```bash
   npm run dev
   ```
   Open the app; sign up and sign in should work. After sign-in, the app shows your name and “Not assigned to a company” until a superadmin assigns you (see Step 7).

## Step 7: Optional – Test Users and Roles

To assign users to Demo Company or promote to admin/superadmin, use the SQL Editor and the examples in `supabase/migrations/003_optional_test_roles.sql`:

- Get a user id from **Authentication** → **Users** (copy the UUID).
- Replace `YOUR_USER_UUID` in the commented SQL with that id, then run:

**Assign to Demo Company (see Action Library):**
```sql
UPDATE public.profiles
SET company_id = (SELECT id FROM public.companies WHERE slug = 'demo-company' LIMIT 1)
WHERE id = 'YOUR_USER_UUID';
```

**Promote to company admin for Demo Company:**
```sql
UPDATE public.profiles
SET role = 'admin', company_id = (SELECT id FROM public.companies WHERE slug = 'demo-company' LIMIT 1)
WHERE id = 'YOUR_USER_UUID';
```

**Promote to superadmin (no company):**
```sql
UPDATE public.profiles
SET role = 'superadmin', company_id = NULL
WHERE id = 'YOUR_USER_UUID';
```

## Troubleshooting

### Migration errors

- Run migrations in order: 001 → 002 → 003
- If 001 was run before (old schema), you may need to reset or run one-off fix migrations; our schema uses `companies` first, then `profiles` with `company_id`/`role`, then `actions` with `company_id`

### RLS / permission errors

- Confirm RLS is enabled on all tables
- Confirm policies match the multi-tenant design (see `docs/MULTI_TENANT_DESIGN.md`)
- Ensure the user is signed in when calling Supabase from the app

### App can’t connect

- Check `.env.local`: correct `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Restart the dev server after changing env vars
- Confirm the Supabase project is active and the anon key is from **API** → anon public

## Step 8: Admin-only User Creation

Users cannot sign up on their own. Only the superadmin can create accounts.

**Current state (Phase 0):**
- Signup page removed (`/signup`)
- Login shows "Contact your administrator" message
- Superadmin seeded: `admin@actionengine` / `admin@actionengine`

**Phase 2b will add:**
- Superadmin panel at `/superadmin`
- User creation form (email, name, role, company assignment)
- Uses Supabase Admin API (`auth.admin.createUser` or `inviteUserByEmail`)

See **[docs/AUTH_SETUP.md](docs/AUTH_SETUP.md)** for detailed auth configuration and user creation flow.

## Next steps

- **Phase 1:** Wire the Action Engine UI to Supabase (company-scoped actions, user_actions)
- **Phases 2a/2b:** Company Admin and Superadmin panels (including user creation)

For schema and roles, see `docs/MULTI_TENANT_DESIGN.md` and `plans/PHASE_0_FOUNDATION.md`.
