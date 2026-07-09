-- Habit loop: store committed rep dates (daily sprint = next 4 days; weekly = same weekday next 4 weeks).
-- Used to show "scheduled for Feb 10" etc. in the queue and to drive reminders.

CREATE TABLE IF NOT EXISTS public.habit_occurrences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  action_id UUID REFERENCES public.actions(id) ON DELETE CASCADE NOT NULL,
  user_action_id UUID REFERENCES public.user_actions(id) ON DELETE CASCADE NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_habit_occurrences_user_action
  ON public.habit_occurrences(user_action_id);
CREATE INDEX IF NOT EXISTS idx_habit_occurrences_user_scheduled
  ON public.habit_occurrences(user_id, scheduled_at);

ALTER TABLE public.habit_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users CRUD own habit_occurrences" ON public.habit_occurrences
  FOR ALL USING (auth.uid() = user_id);

COMMENT ON TABLE public.habit_occurrences IS 'Committed rep dates for habit loop (Rule of 5). Daily = next 4 days; Weekly = same weekday next 4 weeks.';
