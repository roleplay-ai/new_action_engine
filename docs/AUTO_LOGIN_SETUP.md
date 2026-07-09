# Auto-Login Infrastructure (Internal – No Email Sending)

This doc describes the persistent auto-login system. **No emails are sent.** Use for internal testing only.

## Supabase Configuration

1. **Redirect URLs**  
   Add your callback URL to Supabase Auth redirect URLs:
   - Dashboard → Authentication → URL Configuration
   - Add: `https://yourdomain.com/auth/callback` (and `http://localhost:3000/auth/callback` for local dev)

2. **Environment**  
   Optional: set `NEXT_PUBLIC_APP_URL` in `.env.local` for production callback URL:
   ```
   NEXT_PUBLIC_APP_URL=https://yourdomain.com
   ```

## Flow

1. User visits: `GET /api/auto-login?key=UUID`
2. Backend validates key, looks up profile, generates one-time magic link (no email sent)
3. User is redirected to Supabase verify → `/auth/callback#access_token=...`
4. Frontend sets session and redirects to `/`

## Database

- `profiles.persistent_login_key` – UUID for each user
- `auto_login_logs` – audit log of every login attempt (success/failure, IP, user agent)

## Internal Testing

- **Superadmin** → Users → “Auto-login (internal testing)” section
- View keys, copy links, test in incognito/different browsers
- **Rotate** button: generates new key; old links stop working immediately

## Before Sending Emails (Future)

- Decide if permanent links are acceptable
- Consider device binding or soft expiry
- Add rate limiting
