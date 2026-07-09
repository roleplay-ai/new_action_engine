-- Optional: Promote existing users to superadmin or company admin for testing.
-- Run the commands below in Supabase SQL Editor after you have created users via sign-up.
-- Replace YOUR_USER_UUID with the actual id from auth.users (or profiles).
--
-- Promote one user to superadmin (no company):
--   UPDATE public.profiles SET role = 'superadmin', company_id = NULL WHERE id = 'YOUR_USER_UUID';
--
-- Promote one user to company admin for Demo Company:
--   UPDATE public.profiles SET role = 'admin', company_id = (SELECT id FROM public.companies WHERE slug = 'demo-company' LIMIT 1) WHERE id = 'YOUR_USER_UUID';
--
-- Assign a regular user to Demo Company (so they see the Action Library):
--   UPDATE public.profiles SET company_id = (SELECT id FROM public.companies WHERE slug = 'demo-company' LIMIT 1) WHERE id = 'YOUR_USER_UUID';

-- No-op so this migration runs successfully
SELECT 1;
