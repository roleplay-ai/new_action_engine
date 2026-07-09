-- Users can generate as many draft actions as they want during onboarding review
-- (via "Generate more"), but only BATCH_SIZE (3) should land in "My Actions" per
-- delivery. Extra kept drafts are staged here and consumed FIFO by the next
-- delivery(s) before the cron falls back to generating fresh ones via Gemini.

CREATE TABLE IF NOT EXISTS public.personal_action_backlog (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  theme action_theme NOT NULL,
  title TEXT NOT NULL,
  how TEXT NOT NULL,
  why TEXT NOT NULL,
  time_estimate TEXT NOT NULL DEFAULT '5 mins',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_action_backlog_user_created
  ON public.personal_action_backlog(user_id, created_at);

ALTER TABLE public.personal_action_backlog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users CRUD own personal_action_backlog" ON public.personal_action_backlog
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.personal_action_backlog IS
  'Extra AI-generated personal action drafts kept by the user beyond the current delivery''s BATCH_SIZE. Consumed oldest-first by the next delivery cycle(s).';
