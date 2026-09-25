-- Per-batch display-name override for a team (participant_tags row). The
-- same tag can be assigned across many companies'/batches' cohort_members
-- rows for team-score grouping purposes (see 057_participant_tags.sql), but a
-- superadmin may want one specific batch to show a different label for that
-- team without renaming it everywhere else it's used. NULL/no row means "show
-- the tag's own global name" for that batch.

CREATE TABLE IF NOT EXISTS public.cohort_team_names (
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.participant_tags(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 60),
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cohort_id, tag_id)
);

COMMENT ON TABLE public.cohort_team_names IS
  'Per-batch override label for a shared participant_tags team, set by a superadmin. Falls back to participant_tags.name when no row exists for a (cohort_id, tag_id) pair.';

ALTER TABLE public.cohort_team_names ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read cohort_team_names" ON public.cohort_team_names;
CREATE POLICY "Read cohort_team_names" ON public.cohort_team_names
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Superadmin insert cohort_team_names" ON public.cohort_team_names;
CREATE POLICY "Superadmin insert cohort_team_names" ON public.cohort_team_names
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

DROP POLICY IF EXISTS "Superadmin update cohort_team_names" ON public.cohort_team_names;
CREATE POLICY "Superadmin update cohort_team_names" ON public.cohort_team_names
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

DROP POLICY IF EXISTS "Superadmin delete cohort_team_names" ON public.cohort_team_names;
CREATE POLICY "Superadmin delete cohort_team_names" ON public.cohort_team_names
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

-- Team Commitment Scores now prefer this batch's own override label over the
-- tag's global name, so a rename actually shows up where "teams" are visible
-- to participants (RCPL workspace) and in the team leaderboard email.
CREATE OR REPLACE FUNCTION public.get_cohort_team_commitment_scores(p_cohort_id UUID)
RETURNS TABLE(
  team_name TEXT,
  average_score NUMERIC,
  member_count INTEGER,
  scored_member_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.cohort_members
    WHERE user_id = v_user_id
      AND cohort_id = p_cohort_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.cohorts AS cohort ON cohort.id = p_cohort_id
    WHERE profile.id = v_user_id
      AND (
        profile.role = 'superadmin'
        OR (profile.role = 'admin' AND profile.company_id = cohort.company_id)
      )
  ) THEN
    RAISE EXCEPTION 'You do not have access to this cohort';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(ctn.display_name, pt.name, 'Unassigned') AS team_name,
    ROUND(AVG(public.commitment_wallet_plan_score(plan.id)), 1) AS average_score,
    COUNT(DISTINCT cm.user_id)::INTEGER AS member_count,
    COUNT(plan.id)::INTEGER AS scored_member_count
  FROM public.cohort_members AS cm
  LEFT JOIN public.participant_tags AS pt ON pt.id = cm.tag_id
  LEFT JOIN public.cohort_team_names AS ctn ON ctn.cohort_id = cm.cohort_id AND ctn.tag_id = cm.tag_id
  LEFT JOIN public.commitment_wallet_plans AS plan
    ON plan.cohort_id = cm.cohort_id AND plan.user_id = cm.user_id
  WHERE cm.cohort_id = p_cohort_id
  GROUP BY cm.tag_id, pt.name, ctn.display_name
  ORDER BY COALESCE(ctn.display_name, pt.name) NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_cohort_team_commitment_scores(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cohort_team_commitment_scores(UUID) TO authenticated;
