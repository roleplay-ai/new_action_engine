-- Keep the canonical Supabase Auth email available on public.profiles.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

UPDATE public.profiles AS profile
SET email = auth_user.email
FROM auth.users AS auth_user
WHERE profile.id = auth_user.id
  AND profile.email IS DISTINCT FROM auth_user.email;

CREATE INDEX IF NOT EXISTS profiles_email_idx
  ON public.profiles (email);

COMMENT ON COLUMN public.profiles.email IS
  'Canonical email copied from auth.users and maintained by database triggers.';

-- Profile writes must not be able to set an email different from Supabase Auth.
CREATE OR REPLACE FUNCTION public.set_profile_email_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT auth_user.email
  INTO NEW.email
  FROM auth.users AS auth_user
  WHERE auth_user.id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profile_email_on_insert ON public.profiles;
CREATE TRIGGER set_profile_email_on_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_profile_email_from_auth();

DROP TRIGGER IF EXISTS protect_profile_email_on_update ON public.profiles;
CREATE TRIGGER protect_profile_email_on_update
  BEFORE UPDATE OF email ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_profile_email_from_auth();

-- Keep profiles synchronized when an email is changed through Supabase Auth.
CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_profile_email_from_auth();

-- Include email when the existing signup trigger creates a profile.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    company_id,
    role,
    persistent_login_key
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    NULL,
    'user',
    gen_random_uuid()
  );

  RETURN NEW;
END;
$$;
