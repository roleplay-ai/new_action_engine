-- Email schedules: cron-based scheduled email sending via SendGrid templates
-- The Vercel cron hits /api/cron/email-scheduler every hour;
-- this table stores what to send, to whom, and when.

CREATE TABLE IF NOT EXISTS public.email_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Display & template
  name TEXT NOT NULL,
  template_id TEXT NOT NULL,

  -- Target users (UUIDs from auth.users)
  user_ids UUID[] NOT NULL DEFAULT '{}',

  -- Schedule configuration
  -- 'daily'       → every day at run_time_utc
  -- 'weekly'      → every 7 days at run_time_utc
  -- 'every_n_days'→ every interval_days days at run_time_utc
  -- 'specific_date'→ one-time fire at specific_run_at, then deactivated
  schedule_type TEXT NOT NULL CHECK (
    schedule_type IN ('daily', 'weekly', 'every_n_days', 'specific_date')
  ),

  interval_days    INTEGER,       -- used when schedule_type = 'every_n_days'
  run_time_utc     TEXT NOT NULL DEFAULT '09:00', -- HH:MM in UTC, unused for specific_date
  specific_run_at  TIMESTAMPTZ,   -- used when schedule_type = 'specific_date'

  -- Runtime state
  next_run_at      TIMESTAMPTZ NOT NULL,
  last_run_at      TIMESTAMPTZ,
  last_run_status  TEXT,          -- 'success' | 'partial' | 'failed'
  last_run_sent    INTEGER NOT NULL DEFAULT 0,
  last_run_failed  INTEGER NOT NULL DEFAULT 0,

  is_active BOOLEAN NOT NULL DEFAULT true,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_schedules_next_run
  ON public.email_schedules(next_run_at, is_active);

ALTER TABLE public.email_schedules ENABLE ROW LEVEL SECURITY;

-- Only accessible via service role (admin client); no direct browser access
CREATE POLICY "Service role only email_schedules" ON public.email_schedules
  FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE public.email_schedules IS
  'Cron-based scheduled email sends. Vercel cron fires /api/cron/email-scheduler hourly; '
  'the handler picks up rows where next_run_at <= now() and is_active = true.';
