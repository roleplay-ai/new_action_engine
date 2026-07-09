-- Self-serve AI action generation + weekly reminder emails.
-- Replaces the Habit Loop (Rule of 5 rep-tracking) with:
--   1. Personal, AI-generated actions a user creates for themselves (actions.is_personal)
--   2. A user-picked weekly reminder cadence per accepted action (action_reminders)
--   3. A lightweight per-week "mark done" log (action_reminder_completions)
-- The habit loop's own table and per-user_action rep counters are dropped.

-- 1. Personal actions ---------------------------------------------------------

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS is_personal BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.actions.is_personal IS
  'True for actions a user generated/created for themselves (e.g. via AI onboarding). Visible only to their own creator, not the wider company action bank.';

DROP POLICY IF EXISTS "Read actions in my company" ON public.actions;
CREATE POLICY "Read actions in my company" ON public.actions
  FOR SELECT USING (
    (
      company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
      AND (is_personal = FALSE OR created_by = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

CREATE POLICY "Users insert own personal actions" ON public.actions
  FOR INSERT WITH CHECK (
    is_personal = TRUE
    AND created_by = auth.uid()
    AND company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
  );

-- 2. Onboarding flag on profiles ----------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS self_onboarding_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.self_onboarding_completed_at IS
  'Set once the user completes the self-serve AI action onboarding wizard. NULL means the wizard should still be shown.';

-- 3. Weekly reminder subscriptions ---------------------------------------------

CREATE TABLE IF NOT EXISTS public.action_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  user_action_id UUID REFERENCES public.user_actions(id) ON DELETE CASCADE NOT NULL,
  action_id UUID REFERENCES public.actions(id) ON DELETE CASCADE NOT NULL,
  times_per_week INTEGER NOT NULL CHECK (times_per_week BETWEEN 1 AND 7),
  -- Intended time of day the user plans to do the action (display copy only —
  -- the reminder email itself always sends on the daily cron's one Monday run).
  time_of_day_utc TEXT NOT NULL DEFAULT '03:30',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  next_run_at TIMESTAMPTZ NOT NULL,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_action_id)
);

CREATE INDEX IF NOT EXISTS idx_action_reminders_next_run
  ON public.action_reminders(next_run_at, is_active);
CREATE INDEX IF NOT EXISTS idx_action_reminders_user
  ON public.action_reminders(user_id);

ALTER TABLE public.action_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users CRUD own action_reminders" ON public.action_reminders
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.action_reminders IS
  'A user''s weekly reminder cadence for one accepted action. Cron sends one summary email per due row, grouped by user, each Monday.';

-- 4. Per-week lightweight completion log ---------------------------------------

CREATE TABLE IF NOT EXISTS public.action_reminder_completions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reminder_id UUID REFERENCES public.action_reminders(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  week_start_date DATE NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(reminder_id, week_start_date)
);

ALTER TABLE public.action_reminder_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users CRUD own action_reminder_completions" ON public.action_reminder_completions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.action_reminder_completions IS
  'Lightweight "I did this" mark for a reminder''s current week. No reps/cementing threshold — replaces the old habit_occurrences rep queue.';

-- 5. Remove the Habit Loop (Rule of 5) storage ----------------------------------

DROP TABLE IF EXISTS public.habit_occurrences;

ALTER TABLE public.user_actions
  DROP COLUMN IF EXISTS completed_reps,
  DROP COLUMN IF EXISTS reps_remaining;

-- Note: action_status enum values 'habit_started'/'cemented' and event_type enum
-- values 'HABIT_STARTED'/'CEMENTED' are intentionally left in place (Postgres
-- cannot cheaply drop enum values). The application no longer produces them.
