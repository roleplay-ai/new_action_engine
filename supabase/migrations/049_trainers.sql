-- Trainers: a lightweight, superadmin-authored roster (name + photo) that gets
-- assigned one-per-cohort, plus a private message log participants use to
-- tell their trainer what they need from a session (Base Camp page).
--
-- Trainers have no login of their own in the current role model — admins and
-- superadmins read what participants write via the cohort management screen,
-- the same way company admins already stand in as "trainers" in cohort_messages
-- (034_cohort_chat.sql).

-- 1. Trainer roster ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.trainers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID REFERENCES public.profiles(id),
  name TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.trainers IS
  'Global roster (not company-scoped) authored by superadmin: a trainer''s display name and photo. Assigned to cohorts via cohorts.trainer_id; one trainer can run several cohorts over time.';

ALTER TABLE public.trainers ENABLE ROW LEVEL SECURITY;

-- Name/photo are harmless to read for any authenticated user (shown on the
-- participant Base Camp page); only superadmin authors the roster.
DROP POLICY IF EXISTS "Read trainers" ON public.trainers;
CREATE POLICY "Read trainers" ON public.trainers
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Superadmin insert trainers" ON public.trainers;
CREATE POLICY "Superadmin insert trainers" ON public.trainers
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );
DROP POLICY IF EXISTS "Superadmin update trainers" ON public.trainers;
CREATE POLICY "Superadmin update trainers" ON public.trainers
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );
DROP POLICY IF EXISTS "Superadmin delete trainers" ON public.trainers;
CREATE POLICY "Superadmin delete trainers" ON public.trainers
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

-- 2. Cohorts get a single assigned trainer -----------------------------------

ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS trainer_id UUID REFERENCES public.trainers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cohorts_trainer ON public.cohorts(trainer_id);

COMMENT ON COLUMN public.cohorts.trainer_id IS
  'The trainer running this cohort, assigned by a superadmin. Nullable: a cohort can go without a named trainer.';

-- 3. Private messages to trainer ---------------------------------------------
-- An append-only log, not a single editable note: a participant can send the
-- trainer as many messages as they like over the course of a cohort, the same
-- way they can post any number of messages into cohort_messages.

CREATE TABLE IF NOT EXISTS public.trainer_expectations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trainer_expectations_cohort ON public.trainer_expectations(cohort_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trainer_expectations_user ON public.trainer_expectations(cohort_id, user_id, created_at DESC);

COMMENT ON TABLE public.trainer_expectations IS
  'Private messages a participant sends their trainer from Base Camp ("what do you want from this session?") — one row per message, not per participant. Shared with the trainer only, never with other participants. Read by company admin/superadmin standing in for the trainer.';

ALTER TABLE public.trainer_expectations ENABLE ROW LEVEL SECURITY;

-- Participants can read/send their own messages, for a cohort they belong to.
-- No UPDATE/DELETE policy: messages are append-only, matching cohort_messages.
DROP POLICY IF EXISTS "Members CRUD own trainer_expectations" ON public.trainer_expectations;
DROP POLICY IF EXISTS "Members read own trainer_expectations" ON public.trainer_expectations;
CREATE POLICY "Members read own trainer_expectations" ON public.trainer_expectations
  FOR SELECT USING (
    user_id = auth.uid()
  );
DROP POLICY IF EXISTS "Members send trainer_expectations" ON public.trainer_expectations;
CREATE POLICY "Members send trainer_expectations" ON public.trainer_expectations
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.cohort_members cm
      WHERE cm.cohort_id = trainer_expectations.cohort_id
        AND cm.user_id = auth.uid()
    )
  );

-- Read-only for the cohort's company admin or any superadmin (they stand in
-- for the trainer, who has no login of their own).
DROP POLICY IF EXISTS "Admin read trainer_expectations" ON public.trainer_expectations;
CREATE POLICY "Admin read trainer_expectations" ON public.trainer_expectations
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.cohorts c ON c.id = trainer_expectations.cohort_id
      WHERE p.id = auth.uid()
        AND (p.role = 'superadmin' OR (p.role = 'admin' AND p.company_id = c.company_id))
    )
  );

-- 4. Storage for trainer photos ----------------------------------------------
-- Public bucket for durable display URLs; writes only via the superadmin-gated
-- signed upload action (service-role client), same convention as cohort-logos.

INSERT INTO storage.buckets (id, name, public)
VALUES ('trainer-images', 'trainer-images', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
