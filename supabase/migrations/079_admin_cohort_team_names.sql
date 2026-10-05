-- Company admins can now rename teams for their own batches (the admin
-- Control panel → Team assign screen). An override row only ever applies to
-- one cohort (see 078_cohort_team_names.sql), so letting an admin write rows
-- for cohorts in their own company never changes how a shared team is named
-- in any other company's batch. Superadmin policies from 078 stay as they are.

DROP POLICY IF EXISTS "Admin insert cohort_team_names" ON public.cohort_team_names;
CREATE POLICY "Admin insert cohort_team_names" ON public.cohort_team_names
  FOR INSERT WITH CHECK (
    cohort_id IN (
      SELECT c.id FROM public.cohorts c
      JOIN public.profiles pr ON pr.id = auth.uid() AND pr.role = 'admin' AND pr.company_id = c.company_id
    )
  );

DROP POLICY IF EXISTS "Admin update cohort_team_names" ON public.cohort_team_names;
CREATE POLICY "Admin update cohort_team_names" ON public.cohort_team_names
  FOR UPDATE USING (
    cohort_id IN (
      SELECT c.id FROM public.cohorts c
      JOIN public.profiles pr ON pr.id = auth.uid() AND pr.role = 'admin' AND pr.company_id = c.company_id
    )
  ) WITH CHECK (
    cohort_id IN (
      SELECT c.id FROM public.cohorts c
      JOIN public.profiles pr ON pr.id = auth.uid() AND pr.role = 'admin' AND pr.company_id = c.company_id
    )
  );

DROP POLICY IF EXISTS "Admin delete cohort_team_names" ON public.cohort_team_names;
CREATE POLICY "Admin delete cohort_team_names" ON public.cohort_team_names
  FOR DELETE USING (
    cohort_id IN (
      SELECT c.id FROM public.cohorts c
      JOIN public.profiles pr ON pr.id = auth.uid() AND pr.role = 'admin' AND pr.company_id = c.company_id
    )
  );

COMMENT ON TABLE public.cohort_team_names IS
  'Per-batch override label for a shared participant_tags team, set by a superadmin or by the company admin of that batch. Falls back to participant_tags.name when no row exists for a (cohort_id, tag_id) pair.';
