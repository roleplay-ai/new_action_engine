-- Dashboard analytics support: open-tracking + cohort attribution on
-- email_campaign_logs (every welcome/reminder/campaign send already writes a
-- row here via sendTemplateToUsers in lib/email-send.ts). template_id already
-- distinguishes category ('credentials' = welcome, 'daily_reminder' =
-- reminder, 'weekly_challenges', 'calendar_invite'), so no separate category
-- column is needed — just filter template_id.

ALTER TABLE public.email_campaign_logs
  ADD COLUMN IF NOT EXISTS resend_message_id TEXT,
  ADD COLUMN IF NOT EXISTS cohort_id UUID REFERENCES public.cohorts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS open_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_resend_message_id
  ON public.email_campaign_logs(resend_message_id) WHERE resend_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_cohort_template
  ON public.email_campaign_logs(cohort_id, template_id, created_at);

COMMENT ON COLUMN public.email_campaign_logs.resend_message_id IS
  'Resend message id returned by resend.emails.send(); used to match incoming email.opened webhook events back to this row.';
COMMENT ON COLUMN public.email_campaign_logs.cohort_id IS
  'Recipient''s batch at send time (profiles.selected_cohort_id / current_cohort_id), used to bucket open-rate stats by batch-relative week.';
COMMENT ON COLUMN public.email_campaign_logs.opened_at IS
  'First time this email was opened, set by the Resend webhook (app/api/webhooks/resend/route.ts). NULL until the recipient''s Resend account has Open Tracking enabled and actually opens the email.';
