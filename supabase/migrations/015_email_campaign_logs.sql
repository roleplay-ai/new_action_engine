-- Email campaign logs: track every login email sent
-- Prevents duplicate sends, provides audit trail

CREATE TABLE IF NOT EXISTS public.email_campaign_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  template_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_user_id
  ON public.email_campaign_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_created_at
  ON public.email_campaign_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_user_date
  ON public.email_campaign_logs(user_id, created_at DESC);

ALTER TABLE public.email_campaign_logs ENABLE ROW LEVEL SECURITY;

-- Only service role can access (no direct client access)
CREATE POLICY "Service role only email_campaign_logs" ON public.email_campaign_logs
  FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE public.email_campaign_logs IS 'Audit log for login emails sent via SendGrid. Service role only.';
