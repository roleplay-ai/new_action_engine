-- Action images: a fixed, superadmin-managed library of stock illustrations
-- (one per common leadership/soft-skill action, e.g. "Ask for clarification
-- when something is unclear.png"). AI-generated action titles are matched to
-- the closest-fitting image in this library by a background job (see
-- lib/action-image-matching.ts) right after each batch of actions is
-- generated, and the result is stored on actions.image_url so the app and
-- outgoing emails can both render it with a plain public URL.

-- 1. Image library -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.action_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Human-readable label the matcher shows the model and matches against —
  -- derived from the source filename (e.g. "Ask for clarification when
  -- something is unclear"). Unique so re-running the seed script is idempotent.
  label TEXT NOT NULL UNIQUE,
  storage_path TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.action_images IS
  'Fixed library of stock action illustrations, seeded via scripts/seed-action-images.mjs. Read by the action-image matching job (lib/action-image-matching.ts) to pick the closest image for each newly generated action.';

ALTER TABLE public.action_images ENABLE ROW LEVEL SECURITY;

-- Harmless to read for any authenticated user; only service-role (the seed
-- script) writes to it today.
DROP POLICY IF EXISTS "Read action_images" ON public.action_images;
CREATE POLICY "Read action_images" ON public.action_images
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 2. Actions get a matched image ----------------------------------------------

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN public.actions.image_url IS
  'Public URL of the action_images row the matching job picked as the closest fit for this action''s title, or NULL if no good match was found (or matching has not run yet).';

-- 3. Storage bucket for the library's image files -----------------------------
-- Public bucket for durable display URLs (app + email); writes only via the
-- service-role seed script, same convention as trainer-images/cohort-logos.

INSERT INTO storage.buckets (id, name, public)
VALUES ('action-images', 'action-images', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
