-- Add accepted_at to user_actions: when user committed (with or without a specific schedule).
-- - When user picks date/time: scheduled_at = that time, accepted_at = now().
-- - When user "accepts" without time (do whenever): scheduled_at = null, accepted_at = now().
-- Validation queue shows "Scheduled for xyz" vs "Accepted on xyz" using these.

ALTER TABLE public.user_actions
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_actions.accepted_at IS 'When the user committed to this action (plan or accept without schedule).';
