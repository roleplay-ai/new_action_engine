# Authentication Setup

This app uses **admin-only user creation**. Users cannot sign up on their own; only the superadmin can create accounts.

## Disable Public Signups in Supabase

To enforce this at the database level, configure Supabase Auth to disable public signups:

### Step 1: Disable signups in Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Providers** → **Email**
3. **Uncheck** or disable **"Enable signup"** (exact option may vary; look for "Disable public signups" or similar)
4. Save changes

This ensures that even if someone tries to call the signup API directly, it will be rejected.

### Step 2: Alternative - Require invitation only

If the above option isn't available in your Supabase version, you can:

1. Go to **Authentication** → **Settings** (or **Policies**)
2. Enable **"Email confirmations"** and configure it so that only emails sent by your system (via superadmin invite) can be confirmed
3. Or use **Supabase Auth Hooks** (available in newer versions) to reject signups unless they have an invitation token

## How User Creation Works

### For Superadmin (Phase 2b)

Once Phase 2b is implemented, the superadmin panel will include a **"Create User"** form that:

1. Collects: email, full name, role (user/admin), company assignment
2. Calls a **Server Action** with service role privileges
3. Uses Supabase Admin API to create the user:
   ```ts
   const { data, error } = await supabase.auth.admin.createUser({
     email: 'user@example.com',
     password: generateTemporaryPassword(), // or send invite link
     email_confirm: true, // skip email confirmation
     user_metadata: { full_name: 'John Doe' }
   });
   ```
4. Creates/updates the `profiles` record with company_id and role

### Temporary Password or Invite Flow

You have two options:

**Option A: Temporary Password**
- Superadmin generates a temporary password
- User logs in and is prompted to change it (you'd add a password change flow)

**Option B: Magic Link / Invite (Recommended)**
- Use Supabase's `inviteUserByEmail()` which sends a one-time login link
- User clicks link, sets their password on first login
- More secure and better UX

Example for invite flow:
```ts
const { data, error } = await supabase.auth.admin.inviteUserByEmail(
  'user@example.com',
  {
    data: { full_name: 'John Doe' },
    redirectTo: 'https://yourdomain.com/auth/callback'
  }
);
```

## Current State (Phase 0)

- ✅ Signup page removed
- ✅ Login page shows "Contact administrator" message
- ✅ Superadmin seeded via `004_seed_superadmin.sql`
- ⏳ Superadmin user creation panel (will be added in Phase 2b)

## Login for Testing

For development/testing, use the seeded superadmin:
- **Email:** `admin@actionengine`
- **Password:** `admin@actionengine`

## Next Steps

**Phase 2b** will add the Superadmin panel (`/superadmin`) with:
- Companies CRUD
- User creation form (with email, name, role, company assignment)
- User management (list users, assign to company, change role)
- Server Actions using `supabase.auth.admin.*` APIs (requires service role key)
