-- Participant-controlled action reminder emails. The chosen plan day/time is
-- authoritative; the shared cron only checks which reminders are now due.

ALTER TABLE public.personal_action_subscriptions
  ADD COLUMN IF NOT EXISTS email_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_date DATE;

-- The free Vercel cron runs only once per day, so offering arbitrary times
-- would be misleading. Keep both action delivery and email reminders aligned
-- to the real 11:30 AM IST / 06:00 UTC processing window.
ALTER TABLE public.personal_action_subscriptions
  ALTER COLUMN time_of_day_utc SET DEFAULT '06:00:00';

UPDATE public.personal_action_subscriptions
SET
  time_of_day_utc = '06:00:00',
  next_delivery_at = (
    (next_delivery_at AT TIME ZONE 'Asia/Kolkata')::DATE + TIME '11:30'
  ) AT TIME ZONE 'Asia/Kolkata',
  updated_at = NOW()
WHERE archived_at IS NULL;

-- Migration 032 originally introduced this audit table. Create its base shape
-- here as well so this migration remains safe for databases whose migration
-- history predates or skipped 032.
CREATE TABLE IF NOT EXISTS public.personal_action_reminder_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  actions JSONB NOT NULL DEFAULT '[]',
  action_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.personal_action_reminder_logs
  ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES public.personal_action_subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cohort_id UUID REFERENCES public.cohorts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reminder_date DATE,
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_personal_action_reminder_logs_created
  ON public.personal_action_reminder_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_personal_action_reminder_logs_user
  ON public.personal_action_reminder_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_action_reminder_logs_subscription
  ON public.personal_action_reminder_logs(subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_personal_action_reminder_logs_cohort
  ON public.personal_action_reminder_logs(cohort_id, created_at DESC);

ALTER TABLE public.personal_action_reminder_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personal_action_reminder_logs'
      AND policyname = 'Service role only personal_action_reminder_logs'
  ) THEN
    CREATE POLICY "Service role only personal_action_reminder_logs"
      ON public.personal_action_reminder_logs
      FOR ALL USING (false) WITH CHECK (false);
  END IF;
END;
$$;

-- A claim is acquired before Resend is called. This makes overlapping cron
-- invocations and manual reruns safe, while allowing up to three delayed
-- retries when a superadmin reruns the scheduler after a provider/API failure.
CREATE TABLE IF NOT EXISTS public.personal_action_reminder_claims (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID REFERENCES public.personal_action_subscriptions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  cohort_id UUID REFERENCES public.cohorts(id) ON DELETE CASCADE NOT NULL,
  reminder_date DATE NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count BETWEEN 1 AND 3),
  last_error TEXT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(subscription_id, reminder_date)
);

CREATE INDEX IF NOT EXISTS idx_personal_action_reminder_claims_status
  ON public.personal_action_reminder_claims(status, updated_at);

ALTER TABLE public.personal_action_reminder_claims ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personal_action_reminder_claims'
      AND policyname = 'Service role only personal_action_reminder_claims'
  ) THEN
    CREATE POLICY "Service role only personal_action_reminder_claims"
      ON public.personal_action_reminder_claims
      FOR ALL USING (false) WITH CHECK (false);
  END IF;
END;
$$;

-- Returns a claim id when this cron invocation may send. A failed attempt can
-- be reclaimed by a manual rerun after 15 minutes, up to three total attempts.
-- Sent reminders and concurrent in-flight sends cannot be reclaimed.
CREATE OR REPLACE FUNCTION public.claim_personal_action_reminder(
  p_subscription_id UUID,
  p_user_id UUID,
  p_cohort_id UUID,
  p_reminder_date DATE,
  p_scheduled_for TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim_id UUID;
BEGIN
  INSERT INTO public.personal_action_reminder_claims (
    subscription_id,
    user_id,
    cohort_id,
    reminder_date,
    scheduled_for
  )
  VALUES (
    p_subscription_id,
    p_user_id,
    p_cohort_id,
    p_reminder_date,
    p_scheduled_for
  )
  ON CONFLICT (subscription_id, reminder_date)
  DO UPDATE SET
    status = 'sending',
    attempt_count = personal_action_reminder_claims.attempt_count + 1,
    last_error = NULL,
    claimed_at = NOW(),
    updated_at = NOW()
  WHERE personal_action_reminder_claims.status = 'failed'
    AND personal_action_reminder_claims.attempt_count < 3
    AND personal_action_reminder_claims.updated_at <= NOW() - INTERVAL '15 minutes'
  RETURNING id INTO v_claim_id;

  RETURN v_claim_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_personal_action_reminder(UUID, UUID, UUID, DATE, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_personal_action_reminder(UUID, UUID, UUID, DATE, TIMESTAMPTZ) TO service_role;

COMMENT ON COLUMN public.personal_action_subscriptions.email_reminders_enabled IS
  'Participant choice made during draft plan setup. In-app action delivery continues when this is false.';
COMMENT ON TABLE public.personal_action_reminder_logs IS
  'Audit log of participant action-reminder emails, including cohort and schedule snapshots.';
COMMENT ON TABLE public.personal_action_reminder_claims IS
  'Idempotency and retry state for participant-selected action reminder emails.';

-- Admin-created broadcast schedules share the same cron. Claim each
-- due schedule before sending so overlapping invocations cannot send it twice.
ALTER TABLE public.email_schedules
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

UPDATE public.email_schedules
SET
  run_time_utc = '06:00',
  next_run_at = (
    (next_run_at AT TIME ZONE 'Asia/Kolkata')::DATE + TIME '11:30'
  ) AT TIME ZONE 'Asia/Kolkata',
  updated_at = NOW()
WHERE is_active = TRUE
  AND schedule_type <> 'specific_date';

CREATE OR REPLACE FUNCTION public.claim_due_email_schedule(
  p_schedule_id UUID,
  p_now TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed_id UUID;
BEGIN
  UPDATE public.email_schedules
  SET processing_started_at = p_now,
      updated_at = p_now
  WHERE id = p_schedule_id
    AND is_active = TRUE
    AND next_run_at <= p_now
    AND (
      processing_started_at IS NULL
      OR processing_started_at <= p_now - INTERVAL '30 minutes'
    )
  RETURNING id INTO v_claimed_id;

  RETURN v_claimed_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_email_schedule(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_email_schedule(UUID, TIMESTAMPTZ) TO service_role;

-- Superadmins may intentionally consume an upcoming occurrence before it is
-- due. This claim remains atomic and uses the same stale-lock protection as
-- the cron claim, but deliberately does not require next_run_at <= p_now.
CREATE OR REPLACE FUNCTION public.claim_email_schedule_for_manual_run(
  p_schedule_id UUID,
  p_now TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed_id UUID;
BEGIN
  UPDATE public.email_schedules
  SET processing_started_at = p_now,
      updated_at = p_now
  WHERE id = p_schedule_id
    AND is_active = TRUE
    AND (
      processing_started_at IS NULL
      OR processing_started_at <= p_now - INTERVAL '30 minutes'
    )
  RETURNING id INTO v_claimed_id;

  RETURN v_claimed_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_schedule_for_manual_run(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_email_schedule_for_manual_run(UUID, TIMESTAMPTZ) TO service_role;
