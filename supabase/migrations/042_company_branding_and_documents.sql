-- Company branding shown throughout cohort workspaces, plus uploaded PDF
-- resources for cohort preparation. Both buckets are public for durable
-- display URLs; writes are only issued through superadmin-gated signed upload
-- actions that use the service-role client.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN public.companies.logo_url IS
  'Public URL for the company logo displayed in admin and participant cohort workspaces.';

COMMENT ON COLUMN public.cohorts.logo_url IS
  'Optional public URL for the cohort logo displayed alongside its name.';

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

INSERT INTO storage.buckets (id, name, public)
VALUES ('cohort-logos', 'cohort-logos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

INSERT INTO storage.buckets (id, name, public)
VALUES ('content-documents', 'content-documents', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
