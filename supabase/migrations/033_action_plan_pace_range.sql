-- Participant plans now support 1-5 actions per period.
-- For weekly plans this means actions per week; for daily plans it means
-- actions per day. The existing column name is retained for compatibility.

ALTER TABLE public.personal_action_subscriptions
  DROP CONSTRAINT IF EXISTS personal_action_subscriptions_daily_action_count_check;

ALTER TABLE public.personal_action_subscriptions
  ADD CONSTRAINT personal_action_subscriptions_daily_action_count_check
    CHECK (daily_action_count BETWEEN 1 AND 5);

COMMENT ON COLUMN public.personal_action_subscriptions.daily_action_count IS
  'Actions per period: actions per week for weekly track, or actions per day for daily track.';
