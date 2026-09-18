-- Team Commitment Scores: participants within a cohort are grouped into
-- "teams" via participant_tags (assigned per cohort_members.tag_id — see
-- 057_participant_tags.sql). This aggregates each team's average Commitment
-- Score (mean of commitment_wallet_plan_score() across members who have a
-- finalised plan) so a participant can see how every team in their batch is
-- doing, shown above the roster ("Your batch") card in the RCPL workspace.
--
-- Members without a finalised plan are excluded from the average (rather
-- than counted as 0) since their score isn't meaningful yet; scored_member
-- vs member_count lets the UI show "3 of 5 committed" alongside the average.

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
    COALESCE(pt.name, 'Unassigned') AS team_name,
    ROUND(AVG(public.commitment_wallet_plan_score(plan.id)), 1) AS average_score,
    COUNT(DISTINCT cm.user_id)::INTEGER AS member_count,
    COUNT(plan.id)::INTEGER AS scored_member_count
  FROM public.cohort_members AS cm
  LEFT JOIN public.participant_tags AS pt ON pt.id = cm.tag_id
  LEFT JOIN public.commitment_wallet_plans AS plan
    ON plan.cohort_id = cm.cohort_id AND plan.user_id = cm.user_id
  WHERE cm.cohort_id = p_cohort_id
  GROUP BY pt.name
  ORDER BY pt.name NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_cohort_team_commitment_scores(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cohort_team_commitment_scores(UUID) TO authenticated;
