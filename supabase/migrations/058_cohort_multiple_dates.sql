-- A cohort can now carry any number of dates (session days, milestones, etc.)
-- instead of a single start_date. The participant workspace counts down to
-- whichever of these is soonest but still in the future.

CREATE TABLE IF NOT EXISTS public.cohort_dates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cohort_dates_cohort ON public.cohort_dates(cohort_id, event_date);

COMMENT ON TABLE public.cohort_dates IS
  'Zero or more dates attached to a cohort (e.g. session days), replacing the old single cohorts.start_date. The participant workspace counts down (days to go) to whichever row is soonest but still in the future.';

-- Backfill: every cohort's old single start_date becomes its first row here.
INSERT INTO public.cohort_dates (cohort_id, event_date)
SELECT id, start_date FROM public.cohorts WHERE start_date IS NOT NULL;

ALTER TABLE public.cohorts DROP COLUMN IF EXISTS start_date;

ALTER TABLE public.cohort_dates ENABLE ROW LEVEL SECURITY;

-- Same visibility as cohort_members: the cohort's own members, or the
-- cohort's company admin/superadmin.
DROP POLICY IF EXISTS "Read cohort_dates" ON public.cohort_dates;
CREATE POLICY "Read cohort_dates" ON public.cohort_dates
  FOR SELECT USING (
    cohort_id IN (SELECT cohort_id FROM public.cohort_members WHERE user_id = auth.uid())
    OR cohort_id IN (
      SELECT c.id FROM public.cohorts c
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = c.company_id))
    )
  );

DROP POLICY IF EXISTS "Admin insert cohort_dates" ON public.cohort_dates;
CREATE POLICY "Admin insert cohort_dates" ON public.cohort_dates
  FOR INSERT WITH CHECK (
    cohort_id IN (
      SELECT c.id FROM public.cohorts c
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = c.company_id))
    )
  );

DROP POLICY IF EXISTS "Admin delete cohort_dates" ON public.cohort_dates;
CREATE POLICY "Admin delete cohort_dates" ON public.cohort_dates
  FOR DELETE USING (
    cohort_id IN (
      SELECT c.id FROM public.cohorts c
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = c.company_id))
    )
  );
