CREATE TABLE IF NOT EXISTS public.participant_session_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cohort_id UUID REFERENCES public.cohorts(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, cohort_id)
);

CREATE INDEX IF NOT EXISTS idx_participant_session_notes_user
  ON public.participant_session_notes(user_id, updated_at DESC);

ALTER TABLE public.participant_session_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own participant session notes" ON public.participant_session_notes;
CREATE POLICY "Users manage own participant session notes" ON public.participant_session_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.participant_session_notes IS
  'Private participant notes for a cohort learning journey. Notes can be used as context for personal action generation.';
