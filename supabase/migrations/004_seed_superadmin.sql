-- Seed a superadmin user (admin@actionengine / admin@actionengine)
-- This creates the user directly in auth.users and profiles.
-- Password is hashed using crypt function.

-- 1. Insert into auth.users (Supabase Auth)
-- Note: This uses a fixed UUID for idempotency. If the user already exists, it will be skipped.
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a0000000-0000-0000-0000-000000000001', -- fixed UUID for superadmin
  'authenticated',
  'authenticated',
  'admin@actionengine',
  crypt('admin@actionengine', gen_salt('bf')), -- bcrypt hash of password
  NOW(), -- email already confirmed
  NOW(),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Superadmin"}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
)
ON CONFLICT (id) DO NOTHING;

-- 1b. Insert into auth.identities (REQUIRED for email login to work)
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
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "email": "admin@actionengine"}'::jsonb,
  'email',
  'a0000000-0000-0000-0000-000000000001',
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 2. Insert into profiles (superadmin role, no company)
INSERT INTO public.profiles (
  id,
  full_name,
  avatar_url,
  company_id,
  role,
  league_index,
  weekly_goal,
  total_points,
  streak,
  last_active_at,
  created_at
)
VALUES (
  'a0000000-0000-0000-0000-000000000001', -- same UUID as auth.users
  'Superadmin',
  NULL,
  NULL, -- superadmin has no company
  'superadmin',
  0,
  3,
  0,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  role = 'superadmin',
  company_id = NULL,
  full_name = 'Superadmin';

-- Note: You can now log in with:
-- Email: admin@actionengine
-- Password: admin@actionengine
