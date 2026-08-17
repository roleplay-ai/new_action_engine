-- Adds click tracking alongside the open tracking added in 065, for the admin
-- Dashboard's Email Open Rates section (now Email Engagement — opens + clicks).

ALTER TABLE public.email_campaign_logs
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_clicked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.email_campaign_logs.clicked_at IS
  'First time a link in this email was clicked, set by the Resend webhook (app/api/webhooks/resend/route.ts) on email.clicked. NULL until the recipient''s Resend account has Click Tracking enabled and a link is actually clicked.';
