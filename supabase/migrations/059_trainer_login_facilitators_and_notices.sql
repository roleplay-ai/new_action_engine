-- Turns "trainer" into a real login role, and replaces the participant ->
-- trainer "expectation" note with a trainer -> cohort notice board, plus a
-- per-cohort facilitator roster.
--
-- 1. profiles.role gains 'trainer'; trainers gets a user_id link so a roster
--    entry (049_trainers.sql) can be signed in as, the same way a participant
--    or admin profile is.
-- 2. cohort_notices replaces trainer_expectations (049/050/054) on the Base
--    Camp page: the trainer now posts dated notices *to* the cohort instead
--    of a participant sending a private one-time note *to* the trainer.
--    trainer_expectations itself is left in place (history, harmless) but the
--    app no longer reads or writes it.
-- 3. facilitators: a per-cohort (not reused across cohorts, unlike trainers)
--    roster of name + designation + PDF, maintained by a superadmin or the
--    cohort's own trainer, shown read-only to participants.
--
-- Every CREATE POLICY is preceded by a DROP POLICY IF EXISTS so this file can
-- be safely re-run in full after a partial failure.

-- 1. Trainer login ------------------------------------------------------------

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'admin', 'superadmin', 'trainer'));

ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_trainers_user ON public.trainers(user_id) WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.trainers.user_id IS
  'The auth account this trainer signs in with, if a superadmin has provisioned one (app/actions/trainers.ts createTrainerLogin). Nullable: a trainer can exist in the roster, assignable to cohorts, without ever getting a login.';

-- Resolve, without recursion, the cohorts the signed-in trainer runs. Used by
-- every policy below instead of repeating the cohorts/trainers join inline.
CREATE OR REPLACE FUNCTION public.current_trainer_cohort_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id FROM public.cohorts c
  JOIN public.trainers t ON t.id = c.trainer_id
  WHERE t.user_id = auth.uid();
$$;

-- 2. Notice board --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cohort_notices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cohort_notices_cohort ON public.cohort_notices(cohort_id, created_at DESC);

COMMENT ON TABLE public.cohort_notices IS
  'Dated notices the trainer (or an admin standing in) posts to a cohort''s notice board on the Base Camp page. Replaces trainer_expectations.';

ALTER TABLE public.cohort_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read cohort_notices" ON public.cohort_notices;
CREATE POLICY "Read cohort_notices" ON public.cohort_notices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.cohort_members cm
      WHERE cm.cohort_id = cohort_notices.cohort_id AND cm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.cohorts c ON c.id = cohort_notices.cohort_id
      WHERE p.id = auth.uid()
        AND (p.role = 'superadmin' OR (p.role = 'admin' AND p.company_id = c.company_id))
    )
    OR cohort_notices.cohort_id IN (SELECT public.current_trainer_cohort_ids())
  );

DROP POLICY IF EXISTS "Trainer and admin post cohort_notices" ON public.cohort_notices;
CREATE POLICY "Trainer and admin post cohort_notices" ON public.cohort_notices
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.cohorts c ON c.id = cohort_notices.cohort_id
        WHERE p.id = auth.uid()
          AND (p.role = 'superadmin' OR (p.role = 'admin' AND p.company_id = c.company_id))
      )
      OR cohort_notices.cohort_id IN (SELECT public.current_trainer_cohort_ids())
    )
  );

DROP POLICY IF EXISTS "Creator and superadmin delete cohort_notices" ON public.cohort_notices;
CREATE POLICY "Creator and superadmin delete cohort_notices" ON public.cohort_notices
  FOR DELETE USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

-- 3. Facilitators (per-cohort, not a reusable roster) --------------------------

CREATE TABLE IF NOT EXISTS public.facilitators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  designation TEXT NOT NULL CHECK (char_length(btrim(designation)) BETWEEN 1 AND 120),
  pdf_url TEXT,
  pdf_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facilitators_cohort ON public.facilitators(cohort_id);

COMMENT ON TABLE public.facilitators IS
  'A cohort-specific facilitator roster (name, designation, PDF) maintained by a superadmin or the cohort''s own trainer. Unlike public.trainers, entries are entered per cohort and not reused elsewhere.';

ALTER TABLE public.facilitators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read facilitators" ON public.facilitators;
CREATE POLICY "Read facilitators" ON public.facilitators
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.cohort_members cm
      WHERE cm.cohort_id = facilitators.cohort_id AND cm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.cohorts c ON c.id = facilitators.cohort_id
      WHERE p.id = auth.uid()
        AND (p.role = 'superadmin' OR (p.role = 'admin' AND p.company_id = c.company_id))
    )
    OR facilitators.cohort_id IN (SELECT public.current_trainer_cohort_ids())
  );

DROP POLICY IF EXISTS "Superadmin and trainer insert facilitators" ON public.facilitators;
CREATE POLICY "Superadmin and trainer insert facilitators" ON public.facilitators
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
    OR facilitators.cohort_id IN (SELECT public.current_trainer_cohort_ids())
  );

DROP POLICY IF EXISTS "Superadmin and trainer update facilitators" ON public.facilitators;
CREATE POLICY "Superadmin and trainer update facilitators" ON public.facilitators
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
    OR facilitators.cohort_id IN (SELECT public.current_trainer_cohort_ids())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
    OR facilitators.cohort_id IN (SELECT public.current_trainer_cohort_ids())
  );

DROP POLICY IF EXISTS "Superadmin and trainer delete facilitators" ON public.facilitators;
CREATE POLICY "Superadmin and trainer delete facilitators" ON public.facilitators
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
    OR facilitators.cohort_id IN (SELECT public.current_trainer_cohort_ids())
  );

-- Public bucket for durable "view PDF" links; writes only via a signed-upload
-- server action gated to superadmin/trainer, mirroring trainer-images.
INSERT INTO storage.buckets (id, name, public)
VALUES ('facilitator-documents', 'facilitator-documents', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- 4. Trainer access to existing cohort-scoped tables ---------------------------

-- cohorts: a trainer needs to read the cohorts they run (Base Camp data,
-- roster, the cohort switcher). Additive to the existing company/superadmin
-- policy from 025_cohorts_and_prepare_content.sql.
DROP POLICY IF EXISTS "Trainer read own cohorts" ON public.cohorts;
CREATE POLICY "Trainer read own cohorts" ON public.cohorts
  FOR SELECT USING (id IN (SELECT public.current_trainer_cohort_ids()));

-- cohort_members: trainer reads their cohort's roster and updates tag_id
-- (the same shape as the existing superadmin policies from 025/028/057).
DROP POLICY IF EXISTS "Read cohort_members" ON public.cohort_members;
CREATE POLICY "Read cohort_members" ON public.cohort_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR cohort_id IN (
      SELECT c.id FROM public.cohorts c
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = c.company_id))
    )
    OR cohort_id IN (SELECT public.current_trainer_cohort_ids())
  );

DROP POLICY IF EXISTS "Trainer update cohort_members" ON public.cohort_members;
CREATE POLICY "Trainer update cohort_members" ON public.cohort_members
  FOR UPDATE USING (
    cohort_id IN (SELECT public.current_trainer_cohort_ids())
  ) WITH CHECK (
    cohort_id IN (SELECT public.current_trainer_cohort_ids())
  );

-- cohort_messages: trainer joins the conversation as themself instead of an
-- admin standing in (senderRole already renders 'trainer' generically — see
-- app/actions/cohort-chat.ts). Recreates both 034_cohort_chat.sql policies
-- with the trainer branch added.
DROP POLICY IF EXISTS "Cohort members and trainers read messages" ON public.cohort_messages;
CREATE POLICY "Cohort members and trainers read messages" ON public.cohort_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.cohort_members cm
      WHERE cm.cohort_id = cohort_messages.cohort_id AND cm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.cohorts c ON c.id = cohort_messages.cohort_id
      WHERE p.id = auth.uid()
        AND (p.role = 'superadmin' OR (p.role = 'admin' AND p.company_id = c.company_id))
    )
    OR cohort_messages.cohort_id IN (SELECT public.current_trainer_cohort_ids())
  );

DROP POLICY IF EXISTS "Cohort members and trainers send messages" ON public.cohort_messages;
CREATE POLICY "Cohort members and trainers send messages" ON public.cohort_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.cohort_members cm
        WHERE cm.cohort_id = cohort_messages.cohort_id AND cm.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.cohorts c ON c.id = cohort_messages.cohort_id
        WHERE p.id = auth.uid()
          AND (p.role = 'superadmin' OR (p.role = 'admin' AND p.company_id = c.company_id))
      )
      OR cohort_messages.cohort_id IN (SELECT public.current_trainer_cohort_ids())
    )
  );

-- profiles: trainer needs to read the names of members in cohorts they run
-- (roster, chat sender names, notices) — the same visibility admins already
-- have via current_user_company_id() (008_profiles_policy_recursion_fix.sql).
-- Wrapped in a SECURITY DEFINER function rather than querying cohort_members
-- directly: cohort_members' own SELECT policy joins profiles, so a plain
-- subquery here would close a profiles -> cohort_members -> profiles cycle
-- and break every read of profiles ("infinite recursion detected in policy
-- for relation profiles"). This function bypasses cohort_members' RLS, the
-- same way current_user_role() bypasses profiles' RLS in the 008 fix.
CREATE OR REPLACE FUNCTION public.is_trainer_cohort_member(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cohort_members cm
    WHERE cm.user_id = target_user_id
      AND cm.cohort_id IN (SELECT public.current_trainer_cohort_ids())
  );
$$;

DROP POLICY IF EXISTS "Trainer read own cohort member profiles" ON public.profiles;
CREATE POLICY "Trainer read own cohort member profiles" ON public.profiles
  FOR SELECT USING (public.is_trainer_cohort_member(profiles.id));
