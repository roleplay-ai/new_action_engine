-- Let trainers remove participant tags they (or a superadmin) created, so the
-- Members & tags trainer page can offer a "remove unnecessary tag" action.
-- Mirrors 062_trainer_create_participant_tags.sql, which already granted
-- trainers INSERT on the same global roster.

DROP POLICY IF EXISTS "Trainer delete participant_tags" ON public.participant_tags;
CREATE POLICY "Trainer delete participant_tags" ON public.participant_tags
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'trainer')
  );

COMMENT ON TABLE public.participant_tags IS
  'Global reusable tag list authored by superadmin or trainer; either role may also delete a tag. Assigned to a participant''s specific cohort membership via cohort_members.tag_id.';
