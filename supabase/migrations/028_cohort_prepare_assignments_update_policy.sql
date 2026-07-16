-- Upsert on cohort_prepare_assignments (and cohort_members) requires an
-- UPDATE policy. Without it, ON CONFLICT DO UPDATE fails with:
--   new row violates row-level security policy (USING expression)
-- Same admin/superadmin predicate as the existing INSERT/DELETE policies.

DROP POLICY IF EXISTS "Admin update cohort_prepare_assignments" ON public.cohort_prepare_assignments;
CREATE POLICY "Admin update cohort_prepare_assignments" ON public.cohort_prepare_assignments
  FOR UPDATE USING (
    cohort_id IN (
      SELECT c.id FROM public.cohorts c
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = c.company_id))
    )
  )
  WITH CHECK (
    cohort_id IN (
      SELECT c.id FROM public.cohorts c
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = c.company_id))
    )
  );

DROP POLICY IF EXISTS "Admin update cohort_members" ON public.cohort_members;
CREATE POLICY "Admin update cohort_members" ON public.cohort_members
  FOR UPDATE USING (
    cohort_id IN (
      SELECT c.id FROM public.cohorts c
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = c.company_id))
    )
  )
  WITH CHECK (
    cohort_id IN (
      SELECT c.id FROM public.cohorts c
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = c.company_id))
    )
  );
