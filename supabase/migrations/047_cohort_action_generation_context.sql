-- Superadmins configure the shared context used to generate every
-- participant's personal actions within a cohort. Participant notes remain
-- private and are stored separately on the participant's plan/job records.

ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS training_content TEXT,
  ADD COLUMN IF NOT EXISTS business_context TEXT;

COMMENT ON COLUMN public.cohorts.training_content IS
  'Superadmin-provided cohort training topics, agenda, themes, or session content used for personal action generation.';

COMMENT ON COLUMN public.cohorts.business_context IS
  'Superadmin-provided company, industry, operating environment, and realistic work situations used for personal action generation.';
