-- Commitment Score should drop only while an action is still outstanding as a
-- miss: Pending validation (auto-expired) or Didn't complete (confirmed skip /
-- fail). Completing it — including after the assigned IST day, or later from
-- Didn't complete — must not keep counting as a miss, so the score stays up
-- or comes back. Batch Action Bank points are unchanged: only completed_on_time
-- and validated_late award 50.

COMMENT ON COLUMN public.commitment_wallet_events.event_type IS
  'completed_on_time, completed_late, and validated_late all count toward the Commitment Score. missed does not (Pending validation / Didn''t complete). completed_on_time and validated_late award 50 points; completed_late records the done-after-assigned-day check-in at 0 points.';

COMMENT ON COLUMN public.user_actions.completed_late IS
  'True when completion occurred after the assigned IST date. Batch Action Bank points are not awarded for an ordinary late check-in; the Commitment Score is still kept (or restored if the action had been a miss).';

CREATE OR REPLACE FUNCTION public.commitment_wallet_plan_score(p_plan_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN plan.planned_actions > 0 THEN
    ROUND(
      (
        GREATEST(
          0,
          plan.planned_actions - (
            SELECT COUNT(*)::INTEGER
            FROM public.commitment_wallet_events AS event
            WHERE event.plan_id = plan.id
              AND event.event_type = 'missed'
          )
        ) * 100.0 / plan.planned_actions
      )::NUMERIC,
      1
    )
  ELSE 0 END
  FROM public.commitment_wallet_plans AS plan
  WHERE plan.id = p_plan_id;
$$;

REVOKE ALL ON FUNCTION public.commitment_wallet_plan_score(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commitment_wallet_plan_score(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_commitment_wallet(p_cohort_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_plan public.commitment_wallet_plans%ROWTYPE;
  v_planned_actions INTEGER := 0;
  v_personal_maximum INTEGER := 0;
  v_missed_actions INTEGER := 0;
  v_completed_on_time INTEGER := 0;
  v_personal_plan_points INTEGER := 0;
  v_personal_action_points INTEGER := 0;
  v_personal_points INTEGER := 0;
  v_team_plan_points INTEGER := 0;
  v_team_action_points INTEGER := 0;
  v_team_points INTEGER := 0;
  v_team_maximum INTEGER := 0;
  v_team_members INTEGER := 0;
  v_rank INTEGER := 0;
  v_score NUMERIC := 0;
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

  SELECT * INTO v_plan
  FROM public.commitment_wallet_plans
  WHERE user_id = v_user_id
    AND cohort_id = p_cohort_id;

  IF FOUND THEN
    v_planned_actions := v_plan.planned_actions;
    v_personal_plan_points := v_plan.plan_bonus_points;
    v_personal_maximum := v_plan.maximum_points + v_plan.plan_bonus_points;

    SELECT
      COUNT(*) FILTER (WHERE event_type = 'missed')::INTEGER,
      COUNT(*) FILTER (WHERE event_type = 'completed_on_time')::INTEGER,
      COALESCE(SUM(points_awarded), 0)::INTEGER
    INTO v_missed_actions, v_completed_on_time, v_personal_action_points
    FROM public.commitment_wallet_events
    WHERE user_id = v_user_id
      AND cohort_id = p_cohort_id;

    v_personal_points := v_personal_plan_points + v_personal_action_points;
    v_score := ROUND(
      (GREATEST(0, v_planned_actions - v_missed_actions) * 100.0 / v_planned_actions)::NUMERIC,
      1
    );
  END IF;

  SELECT
    COALESCE(SUM(maximum_points + plan_bonus_points), 0)::INTEGER,
    COALESCE(SUM(plan_bonus_points), 0)::INTEGER,
    COUNT(*)::INTEGER
  INTO v_team_maximum, v_team_plan_points, v_team_members
  FROM public.commitment_wallet_plans
  WHERE cohort_id = p_cohort_id;

  SELECT COALESCE(SUM(points_awarded), 0)::INTEGER
  INTO v_team_action_points
  FROM public.commitment_wallet_events
  WHERE cohort_id = p_cohort_id;

  v_team_points := v_team_plan_points + v_team_action_points;

  IF v_plan.id IS NOT NULL THEN
    WITH contributions AS (
      SELECT
        plan.user_id,
        plan.plan_bonus_points + COALESCE(SUM(event.points_awarded), 0)::INTEGER AS points
      FROM public.commitment_wallet_plans AS plan
      LEFT JOIN public.commitment_wallet_events AS event
        ON event.plan_id = plan.id
      WHERE plan.cohort_id = p_cohort_id
      GROUP BY plan.id, plan.user_id, plan.plan_bonus_points
    ), ranked AS (
      SELECT
        user_id,
        DENSE_RANK() OVER (ORDER BY points DESC)::INTEGER AS contribution_rank
      FROM contributions
    )
    SELECT contribution_rank INTO v_rank
    FROM ranked
    WHERE user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'hasFinalisedPlan', v_plan.id IS NOT NULL,
    'plannedActions', v_planned_actions,
    'missedActions', v_missed_actions,
    'completedOnTimeActions', v_completed_on_time,
    'personalPlanPoints', v_personal_plan_points,
    'personalActionPoints', v_personal_action_points,
    'personalPoints', v_personal_points,
    'personalMaximumPoints', v_personal_maximum,
    'commitmentScore', v_score,
    'teamPlanPoints', v_team_plan_points,
    'teamActionPoints', v_team_action_points,
    'teamPoints', v_team_points,
    'teamMaximumPoints', v_team_maximum,
    'teamMemberCount', v_team_members,
    'contributionRank', v_rank
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_commitment_wallet(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_commitment_wallet(UUID) TO authenticated;
