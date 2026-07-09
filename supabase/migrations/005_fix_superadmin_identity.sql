-- Fix: Add missing auth.identities record for superadmin (required for login)
-- Run this if you seeded 004 but cannot log in with admin@actionengine.
-- Creates the identity record so Supabase Auth can verify the password.

INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "email": "admin@actionengine"}'::jsonb,
  'email',
  'a0000000-0000-0000-0000-000000000001',
  NOW(),
  NOW(),
  NOW()
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = 'a0000000-0000-0000-0000-000000000001')
  AND NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = 'a0000000-0000-0000-0000-000000000001' AND provider = 'email');
