-- Backfill persistent_login_key for existing users
-- and update trigger so new users get a key automatically

-- 1. Backfill: create profiles for any auth.users that don't have one (edge case)
INSERT INTO public.profiles (id, persistent_login_key)
SELECT id, gen_random_uuid()
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 2. Backfill: assign key to all existing profiles that don't have one
UPDATE public.profiles
SET persistent_login_key = gen_random_uuid()
WHERE persistent_login_key IS NULL;

-- 3. Update handle_new_user to set persistent_login_key for new signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, company_id, role, persistent_login_key)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    NULL,
    'user',
    gen_random_uuid()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
