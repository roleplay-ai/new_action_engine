-- 049_trainers.sql originally modeled trainer_expectations as a single
-- editable note per participant per cohort (UNIQUE(cohort_id, user_id)).
-- It is now an append-only message log instead — a participant can send
-- their trainer as many messages as they like, the same way cohort_messages
-- works. If you already applied the original 049, run this to bring your
-- database in line with the current 049_trainers.sql on disk.

ALTER TABLE public.trainer_expectations
  DROP CONSTRAINT IF EXISTS trainer_expectations_cohort_id_user_id_key;

ALTER TABLE public.trainer_expectations
  DROP COLUMN IF EXISTS updated_at;

DROP INDEX IF EXISTS idx_trainer_expectations_cohort;
CREATE INDEX IF NOT EXISTS idx_trainer_expectations_cohort ON public.trainer_expectations(cohort_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trainer_expectations_user ON public.trainer_expectations(cohort_id, user_id, created_at DESC);

COMMENT ON TABLE public.trainer_expectations IS
  'Private messages a participant sends their trainer from Base Camp ("what do you want from this session?") — one row per message, not per participant. Shared with the trainer only, never with other participants. Read by company admin/superadmin standing in for the trainer.';

ALTER TABLE public.trainer_expectations ENABLE ROW LEVEL SECURITY;

-- Replace the old "CRUD own note" policy (which allowed UPDATE) with
-- read/insert-only — messages are append-only, matching cohort_messages.
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

-- "Admin read trainer_expectations" (company admin / superadmin, read-only)
-- is unchanged from 049_trainers.sql and does not need to be recreated.
