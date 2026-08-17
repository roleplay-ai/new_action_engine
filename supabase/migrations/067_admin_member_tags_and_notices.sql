-- Let company admins use the same member-tag and notice-board tools trainers
-- already have. Tags stay a global roster (same as 062/063 for trainers and
-- 064 for the content library): additive policies, not edits of the existing
-- superadmin/trainer ones. Notice deletion currently allows only the author
-- or a superadmin — company admins need to remove a batch notice they did
-- not post themselves.

DROP POLICY IF EXISTS "Admin insert participant_tags" ON public.participant_tags;
CREATE POLICY "Admin insert participant_tags" ON public.participant_tags
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admin delete participant_tags" ON public.participant_tags;
CREATE POLICY "Admin delete participant_tags" ON public.participant_tags
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

COMMENT ON TABLE public.participant_tags IS
  'Global reusable tag list authored by superadmin, admin, or trainer. Assigned to a participant''s specific cohort membership via cohort_members.tag_id.';

DROP POLICY IF EXISTS "Admin delete cohort_notices" ON public.cohort_notices;
CREATE POLICY "Admin delete cohort_notices" ON public.cohort_notices
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.cohorts c ON c.id = cohort_notices.cohort_id
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.company_id = c.company_id
    )
  );
