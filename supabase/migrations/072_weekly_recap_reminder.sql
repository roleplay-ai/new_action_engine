-- Friday "week recap" reminder — separate from the daily/weekly action
-- reminder (migration 038). Sent once a week (Fridays at 4:00 PM IST / 10:30
-- UTC, see vercel.json) to every active participant with a per-user list of
-- everything still not validated, and a single "I completed all" bulk-complete
-- link instead of per-action links.
--
-- Mirrors the claim/log pattern used for personal_action_reminder_claims and
-- personal_action_reminder_logs so overlapping or retried cron invocations
-- stay idempotent per subscription per week.

CREATE TABLE IF NOT EXISTS public.personal_action_weekly_recap_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID REFERENCES public.personal_action_subscriptions(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  cohort_id UUID REFERENCES public.cohorts(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  actions JSONB NOT NULL DEFAULT '[]',
  action_count INTEGER NOT NULL DEFAULT 0,
  recap_date DATE NOT NULL,
  scheduled_for TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_action_weekly_recap_logs_created
  ON public.personal_action_weekly_recap_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_personal_action_weekly_recap_logs_user
  ON public.personal_action_weekly_recap_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_action_weekly_recap_logs_subscription
  ON public.personal_action_weekly_recap_logs(subscription_id, created_at DESC);

ALTER TABLE public.personal_action_weekly_recap_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personal_action_weekly_recap_logs'
      AND policyname = 'Service role only personal_action_weekly_recap_logs'
  ) THEN
    CREATE POLICY "Service role only personal_action_weekly_recap_logs"
      ON public.personal_action_weekly_recap_logs
      FOR ALL USING (false) WITH CHECK (false);
  END IF;
END;
$$;

-- A claim is acquired before Resend is called, keyed by (subscription, week),
-- so a rerun or overlapping invocation within the same Friday cannot double
-- send. Up to three delayed retries are allowed after failures, matching the
-- daily/weekly reminder claim table.
CREATE TABLE IF NOT EXISTS public.personal_action_weekly_recap_claims (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID REFERENCES public.personal_action_subscriptions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  cohort_id UUID REFERENCES public.cohorts(id) ON DELETE CASCADE NOT NULL,
  recap_date DATE NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count BETWEEN 1 AND 3),
  last_error TEXT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(subscription_id, recap_date)
);

CREATE INDEX IF NOT EXISTS idx_personal_action_weekly_recap_claims_status
  ON public.personal_action_weekly_recap_claims(status, updated_at);

ALTER TABLE public.personal_action_weekly_recap_claims ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personal_action_weekly_recap_claims'
      AND policyname = 'Service role only personal_action_weekly_recap_claims'
  ) THEN
    CREATE POLICY "Service role only personal_action_weekly_recap_claims"
      ON public.personal_action_weekly_recap_claims
      FOR ALL USING (false) WITH CHECK (false);
  END IF;
END;
$$;

-- Returns a claim id when this cron invocation may send. A failed attempt can
-- be reclaimed by a manual rerun after 15 minutes, up to three total attempts.
-- Sent recaps and concurrent in-flight sends cannot be reclaimed.
CREATE OR REPLACE FUNCTION public.claim_personal_action_weekly_recap(
  p_subscription_id UUID,
  p_user_id UUID,
  p_cohort_id UUID,
  p_recap_date DATE,
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
  INSERT INTO public.personal_action_weekly_recap_claims (
    subscription_id,
    user_id,
    cohort_id,
    recap_date,
    scheduled_for
  )
  VALUES (
    p_subscription_id,
    p_user_id,
    p_cohort_id,
    p_recap_date,
    p_scheduled_for
  )
  ON CONFLICT (subscription_id, recap_date)
  DO UPDATE SET
    status = 'sending',
    attempt_count = personal_action_weekly_recap_claims.attempt_count + 1,
    last_error = NULL,
    claimed_at = NOW(),
    updated_at = NOW()
  WHERE personal_action_weekly_recap_claims.status = 'failed'
    AND personal_action_weekly_recap_claims.attempt_count < 3
    AND personal_action_weekly_recap_claims.updated_at <= NOW() - INTERVAL '15 minutes'
  RETURNING id INTO v_claim_id;

  RETURN v_claim_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_personal_action_weekly_recap(UUID, UUID, UUID, DATE, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_personal_action_weekly_recap(UUID, UUID, UUID, DATE, TIMESTAMPTZ) TO service_role;

COMMENT ON TABLE public.personal_action_weekly_recap_logs IS
  'Audit log of the Friday week-recap emails (all still-unvalidated actions + one bulk "I completed all" link).';
COMMENT ON TABLE public.personal_action_weekly_recap_claims IS
  'Idempotency and retry state for the Friday week-recap emails, one claim per subscription per recap_date.';
