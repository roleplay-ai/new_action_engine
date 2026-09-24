-- Per-batch cap on how many weeks a participant's action plan can run for.
-- NULL means "no batch-specific cap" — plan duration is still bounded by the
-- global 2-24 week range enforced in app/actions/ai-actions.ts and by the
-- CHECK on personal_action_subscriptions.duration_weeks (see migration
-- 029_action_plan_duration_and_generation_jobs.sql).

ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS max_weeks INTEGER CHECK (max_weeks IS NULL OR max_weeks BETWEEN 2 AND 24);

COMMENT ON COLUMN public.cohorts.max_weeks IS
  'Optional admin-set cap on plan duration (in weeks) for this batch. NULL falls back to the global 2-24 week range.';
