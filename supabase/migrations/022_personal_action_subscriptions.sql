-- Replace the per-action weekly reminder mechanic with a recurring personal-action
-- delivery subscription: a user picks a track (Daily Sprint / Weekly Sprint) + a time
-- once during onboarding, gets an initial batch of AI-generated actions to act on
-- immediately, and then a fresh batch is generated and dropped into their library
-- (in-app only, no email) each time the cadence comes due.

DROP TABLE IF EXISTS public.action_reminder_completions;
DROP TABLE IF EXISTS public.action_reminders;

CREATE TABLE IF NOT EXISTS public.personal_action_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  -- Stored so the cron can regenerate more actions later without asking again.
  training_text TEXT NOT NULL DEFAULT '',
  focus_themes action_theme[] NOT NULL DEFAULT '{}',
  track TEXT NOT NULL CHECK (track IN ('daily', 'weekly')),
  -- 0 = Sunday, 1 = Monday, ... 6 = Saturday (IST calendar). Only used when track = 'weekly'.
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  -- Intended time of day (IST, HH:MM:SS) — display/intent only. Actual delivery still
  -- runs on the shared daily cron pass, not at this literal clock time (see route comment).
  time_of_day_utc TEXT NOT NULL DEFAULT '03:30:00',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  next_delivery_at TIMESTAMPTZ NOT NULL,
  last_delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT day_of_week_required_for_weekly CHECK (track = 'daily' OR day_of_week IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_personal_action_subscriptions_next_delivery
  ON public.personal_action_subscriptions(next_delivery_at, is_active);

ALTER TABLE public.personal_action_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users CRUD own personal_action_subscriptions" ON public.personal_action_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.personal_action_subscriptions IS
  'One row per user who completed self-serve AI onboarding. Cron generates a fresh batch of personal actions (actions.is_personal = true) each time next_delivery_at is due, then advances it by one day (daily) or seven days (weekly).';
