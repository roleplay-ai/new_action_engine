-- Let company admins author the (global) Prepare content library too —
-- previously superadmin-only. Mirrors the "Admin ..." sibling-policy pattern
-- used for participant_tags (062/063): additive policies alongside the
-- existing superadmin ones rather than editing them.

DROP POLICY IF EXISTS "Admin insert prepare_content_items" ON public.prepare_content_items;
CREATE POLICY "Admin insert prepare_content_items" ON public.prepare_content_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
DROP POLICY IF EXISTS "Admin update prepare_content_items" ON public.prepare_content_items;
CREATE POLICY "Admin update prepare_content_items" ON public.prepare_content_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
DROP POLICY IF EXISTS "Admin delete prepare_content_items" ON public.prepare_content_items;
CREATE POLICY "Admin delete prepare_content_items" ON public.prepare_content_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- quiz_questions / quiz_options were superadmin-only for ALL operations
-- (including SELECT, since is_correct must stay hidden from end users). An
-- admin authoring or editing a quiz needs the same access.
DROP POLICY IF EXISTS "Admin all quiz_questions" ON public.quiz_questions;
CREATE POLICY "Admin all quiz_questions" ON public.quiz_questions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
DROP POLICY IF EXISTS "Admin all quiz_options" ON public.quiz_options;
CREATE POLICY "Admin all quiz_options" ON public.quiz_options
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

COMMENT ON TABLE public.prepare_content_items IS
  'Global content library (not company-scoped) authored by superadmin or admin: videos, quizzes, and pre-read resources. Assigned to cohorts via cohort_prepare_assignments.';
