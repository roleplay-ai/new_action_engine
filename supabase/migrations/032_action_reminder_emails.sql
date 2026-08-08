-- Daily/weekly action-reminder emails: reuses each user's own plan cadence
-- (personal_action_subscriptions.track/days_of_week) to decide which day(s)
-- they get reminded, rather than a separate admin-configured schedule.

-- Guards against double-sending on the same IST day (e.g. a manual "Run now"
-- re-trigger of the shared cron route on top of the real daily run).
ALTER TABLE public.personal_action_subscriptions
  ADD COLUMN IF NOT EXISTS last_reminder_sent_date DATE;

CREATE TABLE IF NOT EXISTS public.personal_action_reminder_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  -- Snapshot of the actions included in this specific email, e.g.
  -- [{"id": "...", "title": "...", "theme": "..."}] — kept even if the
  -- underlying action is later edited/completed/deleted.
  actions JSONB NOT NULL DEFAULT '[]',
  action_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_action_reminder_logs_created
  ON public.personal_action_reminder_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_personal_action_reminder_logs_user
  ON public.personal_action_reminder_logs(user_id);

ALTER TABLE public.personal_action_reminder_logs ENABLE ROW LEVEL SECURITY;

-- Only accessible via service role (admin client) — cron writes it, the
-- superadmin history view reads it through a server action.
CREATE POLICY "Service role only personal_action_reminder_logs" ON public.personal_action_reminder_logs
  FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE public.personal_action_reminder_logs IS
  'Audit log of daily/weekly action-reminder emails sent per user, with a snapshot of which actions were included, for the superadmin history view.';
