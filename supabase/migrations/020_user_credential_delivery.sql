-- Staging table for welcome emails: holds auth user id + plaintext password until SendGrid sends.
-- Supabase Auth stores only a hash; this table exists solely to pass credentials to email.
-- RLS enabled with no policies → only the service role (server) can read/write.
-- Rows are retained so admins can resend credential emails from the control panel.
-- SECURITY: Plaintext passwords are sensitive; protect service role keys and database access.

CREATE TABLE IF NOT EXISTS public.user_credential_delivery (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  plaintext_password TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_credential_delivery ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.user_credential_delivery IS
  'Stored login email + plaintext password for SendGrid template data. Service role only.';
