-- Daily plans always release one action per weekday. Weekly plans retain a
-- participant-selected count from one to five actions per weekly release.

UPDATE public.personal_action_subscriptions
SET daily_action_count = 1
WHERE track = 'daily'
  AND daily_action_count <> 1;

ALTER TABLE public.personal_action_subscriptions
  DROP CONSTRAINT IF EXISTS personal_action_subscriptions_daily_action_count_check;

ALTER TABLE public.personal_action_subscriptions
  ADD CONSTRAINT personal_action_subscriptions_daily_action_count_check
  CHECK (
    (track = 'daily' AND daily_action_count = 1)
    OR
    (track = 'weekly' AND daily_action_count BETWEEN 1 AND 5)
  );

COMMENT ON COLUMN public.personal_action_subscriptions.daily_action_count IS
  'Actions per release: exactly 1 for daily weekday plans; 1-5 for weekly plans.';
