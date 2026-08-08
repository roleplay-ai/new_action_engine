-- Restore one trainer expectation message per participant per cohort.
-- Keep the earliest message when duplicates already exist.

DELETE FROM public.trainer_expectations te
USING public.trainer_expectations newer
WHERE te.cohort_id = newer.cohort_id
  AND te.user_id = newer.user_id
  AND (
    te.created_at > newer.created_at
    OR (te.created_at = newer.created_at AND te.id > newer.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS trainer_expectations_cohort_id_user_id_key
  ON public.trainer_expectations (cohort_id, user_id);

COMMENT ON TABLE public.trainer_expectations IS
  'Private one-time message a participant sends their trainer from Base Camp ("what do you want from this session?"). One row per participant per cohort. Shared with the trainer only, never with other participants. Read by company admin/superadmin standing in for the trainer.';
