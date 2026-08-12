-- Let trainers create participant tags (same global roster superadmins use).
-- Trainers already assign tags via cohort_members.tag_id; this adds INSERT on
-- participant_tags for the trainer role.

DROP POLICY IF EXISTS "Trainer insert participant_tags" ON public.participant_tags;
CREATE POLICY "Trainer insert participant_tags" ON public.participant_tags
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'trainer')
  );

COMMENT ON TABLE public.participant_tags IS
  'Global reusable tag list authored by superadmin or trainer. Assigned to a participant''s specific cohort membership via cohort_members.tag_id.';
