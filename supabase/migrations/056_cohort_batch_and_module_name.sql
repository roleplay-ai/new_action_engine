-- Split a cohort's single free-text name into two explicit parts, similar to
-- a person having a first name and a last name:
--   batch_name  -> required, e.g. "Leadership Cohort — Jan 2026"
--   module_name -> optional, e.g. "Communication Skills"
--
-- cohorts.name is kept as a derived/legacy composite string ("batch — module",
-- or just "batch" when there's no module) so every existing read site that
-- still selects plain `name` (emails, leaderboards, the cohort switcher, …)
-- keeps working unchanged. The application (app/actions/cohorts.ts) is the
-- source of truth that keeps `name` in sync on every insert/update — there is
-- no DB trigger for this, matching the app-computed-state convention noted in
-- 025_cohorts_and_prepare_content.sql.

ALTER TABLE public.cohorts ADD COLUMN IF NOT EXISTS batch_name TEXT;
ALTER TABLE public.cohorts ADD COLUMN IF NOT EXISTS module_name TEXT;

-- Backfill: every existing cohort's single name becomes its batch name, with
-- no module name set (admins can add one later).
UPDATE public.cohorts SET batch_name = name WHERE batch_name IS NULL;

ALTER TABLE public.cohorts ALTER COLUMN batch_name SET NOT NULL;

COMMENT ON COLUMN public.cohorts.batch_name IS
  'Required first part of a cohort''s two-part name, e.g. the batch/group name.';
COMMENT ON COLUMN public.cohorts.module_name IS
  'Optional second part of a cohort''s two-part name, e.g. the training module.';
COMMENT ON COLUMN public.cohorts.name IS
  'Derived legacy composite of batch_name and module_name, kept in sync by the app for read sites that only need a single display string.';
