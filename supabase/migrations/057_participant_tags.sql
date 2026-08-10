-- Participant tags: a superadmin-managed reusable label list (e.g. "Team A",
-- "North Region"), assigned per cohort membership so the same participant can
-- carry a different tag in each cohort they've belonged to over time.
--
-- Shown on each participant's card in the RCPL workspace roster, and used to
-- group/sort that roster by tag. Mirrors the public.trainers pattern (global,
-- superadmin-authored, harmless to read for any authenticated user) — see
-- 049_trainers.sql.

CREATE TABLE IF NOT EXISTS public.participant_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID REFERENCES public.profiles(id),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_participant_tags_name ON public.participant_tags (lower(name));

COMMENT ON TABLE public.participant_tags IS
  'Global reusable tag list (like public.trainers) authored by superadmin. Assigned to a participant''s specific cohort membership via cohort_members.tag_id.';

ALTER TABLE public.participant_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read participant_tags" ON public.participant_tags;
CREATE POLICY "Read participant_tags" ON public.participant_tags
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Superadmin insert participant_tags" ON public.participant_tags;
CREATE POLICY "Superadmin insert participant_tags" ON public.participant_tags
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

DROP POLICY IF EXISTS "Superadmin update participant_tags" ON public.participant_tags;
CREATE POLICY "Superadmin update participant_tags" ON public.participant_tags
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

DROP POLICY IF EXISTS "Superadmin delete participant_tags" ON public.participant_tags;
CREATE POLICY "Superadmin delete participant_tags" ON public.participant_tags
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

-- Assign one tag per cohort membership.
ALTER TABLE public.cohort_members
  ADD COLUMN IF NOT EXISTS tag_id UUID REFERENCES public.participant_tags(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cohort_members_tag ON public.cohort_members(tag_id);

COMMENT ON COLUMN public.cohort_members.tag_id IS
  'The tag assigned to this participant for this specific cohort membership, set by a superadmin.';

-- cohort_members previously had no UPDATE policy at all (only SELECT/INSERT/
-- DELETE) since nothing needed to mutate an existing row. Tag assignment does.
DROP POLICY IF EXISTS "Superadmin update cohort_members" ON public.cohort_members;
CREATE POLICY "Superadmin update cohort_members" ON public.cohort_members
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );
