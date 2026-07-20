-- Fixed-length action plans: users now pick a plan duration (2-24 weeks) during
-- onboarding, and actions/day moves from 1-3 to 2-3-4. The full plan's worth of
-- actions is generated in the background (see personal_action_generation_jobs)
-- and inserted straight into the actions table as it's ready, so it shows up
-- in the Full Action Library immediately. New subscriptions are saved with
-- is_active = false since the daily/weekly delivery cron has nothing left to
-- top up once the whole plan is generated upfront.

ALTER TABLE public.personal_action_subscriptions
  ADD COLUMN IF NOT EXISTS duration_weeks INTEGER CHECK (duration_weeks BETWEEN 2 AND 24),
  ADD COLUMN IF NOT EXISTS total_actions_planned INTEGER;

ALTER TABLE public.personal_action_subscriptions
  DROP CONSTRAINT IF EXISTS personal_action_subscriptions_daily_action_count_check;

ALTER TABLE public.personal_action_subscriptions
  ADD CONSTRAINT personal_action_subscriptions_daily_action_count_check
    CHECK (daily_action_count BETWEEN 2 AND 4);

COMMENT ON COLUMN public.personal_action_subscriptions.duration_weeks IS
  'Length of the user''s action plan in weeks (2-24), chosen during onboarding.';

COMMENT ON COLUMN public.personal_action_subscriptions.total_actions_planned IS
  'Total actions needed for the full plan: duration_weeks * daily_action_count * active days/week.';

-- ── Background generation jobs ────────────────────────────────────────────────
-- One row per onboarding "commit". The AI provider can't generate an entire
-- multi-week plan (potentially hundreds of actions) in a single call, so a job tracks
-- progress while app/api/generate-actions-batch/route.ts generates it in
-- batches, re-triggering itself until total_generated reaches total_needed.

CREATE TABLE IF NOT EXISTS public.personal_action_generation_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  training_text TEXT NOT NULL DEFAULT '',
  focus_themes action_theme[] NOT NULL DEFAULT '{}',
  total_needed INTEGER NOT NULL CHECK (total_needed >= 0),
  total_generated INTEGER NOT NULL DEFAULT 0 CHECK (total_generated >= 0),
  batch_size INTEGER NOT NULL DEFAULT 12,
  status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_action_generation_jobs_user_created
  ON public.personal_action_generation_jobs(user_id, created_at DESC);

ALTER TABLE public.personal_action_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users CRUD own personal_action_generation_jobs" ON public.personal_action_generation_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.personal_action_generation_jobs IS
  'Tracks background progress of generating a user''s full action plan in batches via Gemini. Rows land directly in the actions table as they complete.';
