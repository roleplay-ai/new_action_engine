-- Daily action count preference (1–3) and multi-day weekly sprint selection.

ALTER TABLE public.personal_action_subscriptions
  ADD COLUMN IF NOT EXISTS daily_action_count INTEGER NOT NULL DEFAULT 3
    CHECK (daily_action_count BETWEEN 1 AND 3),
  ADD COLUMN IF NOT EXISTS days_of_week INTEGER[] DEFAULT NULL;

-- Backfill weekly subscriptions from legacy single day_of_week column.
UPDATE public.personal_action_subscriptions
SET days_of_week = ARRAY[day_of_week]
WHERE track = 'weekly'
  AND day_of_week IS NOT NULL
  AND (days_of_week IS NULL OR cardinality(days_of_week) = 0);

ALTER TABLE public.personal_action_subscriptions
  DROP CONSTRAINT IF EXISTS day_of_week_required_for_weekly;

ALTER TABLE public.personal_action_subscriptions
  ADD CONSTRAINT days_of_week_required_for_weekly CHECK (
    track = 'daily'
    OR (days_of_week IS NOT NULL AND cardinality(days_of_week) >= 1)
  );

COMMENT ON COLUMN public.personal_action_subscriptions.daily_action_count IS
  'How many personal actions to deliver per cycle (1, 2, or 3). Set during onboarding.';

COMMENT ON COLUMN public.personal_action_subscriptions.days_of_week IS
  'IST weekdays (0=Sun..6=Sat) for weekly sprint. User may select multiple; each selected day gets a fresh batch.';
