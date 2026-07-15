-- Cohorts no longer wrap packages — users generate their own actions (via the
-- self-serve AI onboarding wizard / personal_action_subscriptions), so there is
-- no admin-curated package delivery to link a cohort to. This drops the two
-- columns added by migration 025 solely for that now-removed linkage.
--
-- The underlying packages/package_actions/package_assignments tables are left
-- in place untouched — they still back existing admin analytics (delivery
-- coverage/consistency metrics) and the weekly email digest, which are
-- out of scope for this change.

ALTER TABLE public.packages
  DROP COLUMN IF EXISTS cohort_id;

ALTER TABLE public.package_assignments
  DROP COLUMN IF EXISTS source;
