-- Auto-login infrastructure: persistent keys + logging
-- NO email sending; internal preparation only.

-- 1. Add persistent_login_key to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS persistent_login_key UUID UNIQUE;

-- 2. Create index for fast key lookups
CREATE INDEX IF NOT EXISTS idx_profiles_persistent_login_key
  ON public.profiles(persistent_login_key)
  WHERE persistent_login_key IS NOT NULL;

-- 3. Create auto_login_logs table for security audit
CREATE TABLE IF NOT EXISTS public.auto_login_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_login_logs_user_id
  ON public.auto_login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_login_logs_created_at
  ON public.auto_login_logs(created_at DESC);

-- RLS: service role only (no direct client access)
ALTER TABLE public.auto_login_logs ENABLE ROW LEVEL SECURITY;

-- No SELECT policy for anon/authenticated - only service role can read/write
CREATE POLICY "Service role only auto_login_logs" ON public.auto_login_logs
  FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE public.auto_login_logs IS 'Audit log for auto-login attempts. Accessible only via service role.';
COMMENT ON COLUMN public.profiles.persistent_login_key IS 'UUID used for persistent auto-login links. Rotate via admin when needed.';
