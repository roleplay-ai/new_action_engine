-- Commitment Wallet
--
-- The Wallet is intentionally separate from profile XP and earlier cohort
-- point experiments:
--   * a cohort bank starts at 0;
--   * every action frozen into a finalised plan is worth 50 possible points;
--   * only completion on the assigned Asia/Kolkata calendar date contributes
--     50 points to the cohort bank;
--   * a missed action reduces the participant's commitment percentage by one
--     equal action share;
--   * completing later records the action as complete, but never restores the
--     commitment share or contributes points.

ALTER TABLE public.user_actions
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_late BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS missed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.commitment_wallet_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.personal_action_subscriptions(id) ON DELETE SET NULL,
  planned_actions INTEGER NOT NULL CHECK (planned_actions > 0),
  maximum_points INTEGER NOT NULL CHECK (maximum_points = planned_actions * 50),
  finalised_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, cohort_id)
);

CREATE TABLE IF NOT EXISTS public.commitment_wallet_actions (
  action_id UUID PRIMARY KEY REFERENCES public.actions(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.commitment_wallet_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 50 CHECK (points = 50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.commitment_wallet_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES public.commitment_wallet_plans(id) ON DELETE CASCADE,
  user_action_id UUID NOT NULL UNIQUE REFERENCES public.user_actions(id) ON DELETE CASCADE,
  action_id UUID NOT NULL UNIQUE REFERENCES public.actions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('completed_on_time', 'missed', 'completed_late')),
  points_awarded INTEGER NOT NULL DEFAULT 0 CHECK (points_awarded IN (0, 50)),
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commitment_wallet_plans_cohort
  ON public.commitment_wallet_plans(cohort_id, finalised_at);
CREATE INDEX IF NOT EXISTS idx_commitment_wallet_actions_plan
  ON public.commitment_wallet_actions(plan_id);
CREATE INDEX IF NOT EXISTS idx_commitment_wallet_events_cohort_points
  ON public.commitment_wallet_events(cohort_id, points_awarded);
CREATE INDEX IF NOT EXISTS idx_commitment_wallet_events_user_outcome
  ON public.commitment_wallet_events(user_id, cohort_id, event_type);
CREATE INDEX IF NOT EXISTS idx_commitment_wallet_unsettled_actions
  ON public.user_actions(scheduled_at)
  WHERE status = 'scheduled';

ALTER TABLE public.commitment_wallet_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commitment_wallet_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commitment_wallet_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own commitment wallet plan" ON public.commitment_wallet_plans;
CREATE POLICY "Users read own commitment wallet plan" ON public.commitment_wallet_plans
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own commitment wallet actions" ON public.commitment_wallet_actions;
CREATE POLICY "Users read own commitment wallet actions" ON public.commitment_wallet_actions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own commitment wallet events" ON public.commitment_wallet_events;
CREATE POLICY "Users read own commitment wallet events" ON public.commitment_wallet_events
  FOR SELECT USING (auth.uid() = user_id);

-- Freeze the participant's current personal actions into the Wallet at the
-- same moment their reviewed plan is finalised. Repeated calls are idempotent;
-- once frozen, the plan maximum cannot be changed.
CREATE OR REPLACE FUNCTION public.activate_my_commitment_wallet_plan(
  p_cohort_id UUID,
  p_next_delivery_at TIMESTAMPTZ
)
RETURNS TABLE (planned_actions INTEGER, maximum_points INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_subscription public.personal_action_subscriptions%ROWTYPE;
  v_plan public.commitment_wallet_plans%ROWTYPE;
  v_action_count INTEGER;
  v_frozen_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_subscription
  FROM public.personal_action_subscriptions
  WHERE user_id = v_user_id
    AND cohort_id = p_cohort_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Create a plan first';
  END IF;
  IF v_subscription.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Archived plans cannot be reactivated';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_action_count
  FROM public.actions
  WHERE created_by = v_user_id
    AND cohort_id = p_cohort_id
    AND is_personal = TRUE;

  IF v_action_count < 1 THEN
    RAISE EXCEPTION 'A plan must contain at least one action';
  END IF;

  INSERT INTO public.commitment_wallet_plans (
    user_id, cohort_id, subscription_id, planned_actions, maximum_points
  ) VALUES (
    v_user_id, p_cohort_id, v_subscription.id, v_action_count, v_action_count * 50
  )
  ON CONFLICT (user_id, cohort_id) DO UPDATE
    SET subscription_id = EXCLUDED.subscription_id,
        updated_at = NOW()
  RETURNING * INTO v_plan;

  IF v_plan.planned_actions <> v_action_count THEN
    RAISE EXCEPTION 'This finalised Wallet plan is already frozen';
  END IF;

  INSERT INTO public.commitment_wallet_actions (
    action_id, plan_id, user_id, cohort_id, points
  )
  SELECT action.id, v_plan.id, v_user_id, p_cohort_id, 50
  FROM public.actions AS action
  WHERE action.created_by = v_user_id
    AND action.cohort_id = p_cohort_id
    AND action.is_personal = TRUE
  ON CONFLICT (action_id) DO NOTHING;

  SELECT COUNT(*)::INTEGER INTO v_frozen_count
  FROM public.commitment_wallet_actions
  WHERE plan_id = v_plan.id;

  IF v_frozen_count <> v_action_count THEN
    RAISE EXCEPTION 'The finalised action list does not match the Wallet plan';
  END IF;

  UPDATE public.personal_action_subscriptions
  SET is_active = TRUE,
      next_delivery_at = p_next_delivery_at,
      last_delivered_at = NULL,
      updated_at = NOW()
  WHERE id = v_subscription.id;

  RETURN QUERY SELECT v_plan.planned_actions, v_plan.maximum_points;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_my_commitment_wallet_plan(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_my_commitment_wallet_plan(UUID, TIMESTAMPTZ) TO authenticated;

-- Settle a Wallet action exactly once. A missed event may later become
-- completed_late, but its zero-point award is immutable.
CREATE OR REPLACE FUNCTION public.settle_my_commitment_wallet_action(
  p_action_id UUID,
  p_success BOOLEAN,
  p_reflection TEXT DEFAULT NULL
)
RETURNS TABLE (points_added INTEGER, completed_late BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_wallet_action public.commitment_wallet_actions%ROWTYPE;
  v_user_action public.user_actions%ROWTYPE;
  v_event public.commitment_wallet_events%ROWTYPE;
  v_user_action_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_on_time BOOLEAN := FALSE;
  v_late BOOLEAN := FALSE;
  v_points INTEGER := 0;
  v_event_type TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_wallet_action
  FROM public.commitment_wallet_actions
  WHERE action_id = p_action_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This action is not part of your finalised Wallet plan';
  END IF;

  SELECT * INTO v_user_action
  FROM public.user_actions
  WHERE user_id = v_user_id
    AND action_id = p_action_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_actions (
      user_id, action_id, cohort_id, status, scheduled_at, accepted_at,
      reflection, is_calendar_synced, completed_at, completed_late, missed_at
    ) VALUES (
      v_user_id, p_action_id, v_wallet_action.cohort_id,
      CASE WHEN p_success THEN 'success'::public.action_status ELSE 'failed'::public.action_status END,
      NULL, v_now, NULLIF(BTRIM(COALESCE(p_reflection, '')), ''), FALSE,
      CASE WHEN p_success THEN v_now ELSE NULL END,
      p_success,
      v_now
    )
    RETURNING * INTO v_user_action;
  END IF;

  v_user_action_id := v_user_action.id;

  SELECT * INTO v_event
  FROM public.commitment_wallet_events
  WHERE action_id = p_action_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF FOUND THEN
    IF p_success AND v_event.event_type <> 'completed_on_time' THEN
      UPDATE public.user_actions
      SET status = 'success'::public.action_status,
          accepted_at = COALESCE(accepted_at, v_now),
          reflection = COALESCE(NULLIF(BTRIM(COALESCE(p_reflection, '')), ''), reflection),
          completed_at = COALESCE(completed_at, v_now),
          completed_late = TRUE,
          missed_at = COALESCE(missed_at, v_event.settled_at),
          updated_at = v_now
      WHERE id = v_user_action_id;

      UPDATE public.commitment_wallet_events
      SET event_type = 'completed_late',
          completed_at = COALESCE(completed_at, v_now),
          updated_at = v_now
      WHERE id = v_event.id;

      RETURN QUERY SELECT v_event.points_awarded, TRUE;
      RETURN;
    END IF;

    UPDATE public.user_actions
    SET reflection = COALESCE(NULLIF(BTRIM(COALESCE(p_reflection, '')), ''), reflection),
        updated_at = v_now
    WHERE id = v_user_action_id;

    RETURN QUERY
    SELECT v_event.points_awarded, v_event.event_type = 'completed_late';
    RETURN;
  END IF;

  v_on_time := v_user_action.scheduled_at IS NOT NULL
    AND (v_user_action.scheduled_at AT TIME ZONE 'Asia/Kolkata')::DATE
        = (v_now AT TIME ZONE 'Asia/Kolkata')::DATE;
  v_late := p_success AND NOT v_on_time;
  v_points := CASE WHEN p_success AND v_on_time THEN 50 ELSE 0 END;
  v_event_type := CASE
    WHEN p_success AND v_on_time THEN 'completed_on_time'
    WHEN p_success THEN 'completed_late'
    ELSE 'missed'
  END;

  UPDATE public.user_actions
  SET status = CASE WHEN p_success THEN 'success'::public.action_status ELSE 'failed'::public.action_status END,
      accepted_at = COALESCE(accepted_at, v_now),
      reflection = COALESCE(NULLIF(BTRIM(COALESCE(p_reflection, '')), ''), reflection),
      completed_at = CASE WHEN p_success THEN v_now ELSE completed_at END,
      completed_late = v_late,
      missed_at = CASE WHEN v_event_type <> 'completed_on_time' THEN v_now ELSE missed_at END,
      updated_at = v_now
  WHERE id = v_user_action_id;

  INSERT INTO public.commitment_wallet_events (
    plan_id, user_action_id, action_id, user_id, cohort_id,
    event_type, points_awarded, settled_at, completed_at
  ) VALUES (
    v_wallet_action.plan_id, v_user_action_id, p_action_id, v_user_id,
    v_wallet_action.cohort_id, v_event_type, v_points, v_now,
    CASE WHEN p_success THEN v_now ELSE NULL END
  );

  RETURN QUERY SELECT v_points, v_late;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_my_commitment_wallet_action(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_my_commitment_wallet_action(UUID, BOOLEAN, TEXT) TO authenticated;

-- The daily scheduler is the safety net for users who do not explicitly mark
-- an assigned action incomplete before its IST calendar date ends.
CREATE OR REPLACE FUNCTION public.expire_overdue_commitment_wallet_actions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_expired INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT
      user_action.id AS user_action_id,
      user_action.action_id,
      user_action.user_id,
      wallet_action.plan_id,
      wallet_action.cohort_id
    FROM public.user_actions AS user_action
    JOIN public.commitment_wallet_actions AS wallet_action
      ON wallet_action.action_id = user_action.action_id
     AND wallet_action.user_id = user_action.user_id
    LEFT JOIN public.commitment_wallet_events AS event
      ON event.action_id = user_action.action_id
     AND event.user_id = user_action.user_id
    WHERE user_action.status = 'scheduled'
      AND event.id IS NULL
      AND user_action.scheduled_at IS NOT NULL
      AND (user_action.scheduled_at AT TIME ZONE 'Asia/Kolkata')::DATE
          < (v_now AT TIME ZONE 'Asia/Kolkata')::DATE
    FOR UPDATE OF user_action SKIP LOCKED
  LOOP
    UPDATE public.user_actions
    SET status = 'failed'::public.action_status,
        reflection = COALESCE(reflection, 'Not completed on the assigned day'),
        missed_at = v_now,
        updated_at = v_now
    WHERE id = v_row.user_action_id;

    INSERT INTO public.commitment_wallet_events (
      plan_id, user_action_id, action_id, user_id, cohort_id,
      event_type, points_awarded, settled_at
    ) VALUES (
      v_row.plan_id, v_row.user_action_id, v_row.action_id, v_row.user_id,
      v_row.cohort_id, 'missed', 0, v_now
    ) ON CONFLICT (action_id) DO NOTHING;

    IF FOUND THEN
      v_expired := v_expired + 1;
    END IF;
  END LOOP;

  RETURN v_expired;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_overdue_commitment_wallet_actions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_overdue_commitment_wallet_actions() TO service_role;

-- Return only narrow cohort totals. Other participants' plans, action content,
-- schedules, reflections, and individual histories remain private.
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
  v_personal_points INTEGER := 0;
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
    v_personal_maximum := v_plan.maximum_points;

    SELECT
      COUNT(*) FILTER (WHERE event_type IN ('missed', 'completed_late'))::INTEGER,
      COUNT(*) FILTER (WHERE event_type = 'completed_on_time')::INTEGER,
      COALESCE(SUM(points_awarded), 0)::INTEGER
    INTO v_missed_actions, v_completed_on_time, v_personal_points
    FROM public.commitment_wallet_events
    WHERE user_id = v_user_id
      AND cohort_id = p_cohort_id;

    v_score := ROUND(
      (GREATEST(0, v_planned_actions - v_missed_actions) * 100.0 / v_planned_actions)::NUMERIC,
      1
    );
  END IF;

  SELECT
    COALESCE(SUM(maximum_points), 0)::INTEGER,
    COUNT(*)::INTEGER
  INTO v_team_maximum, v_team_members
  FROM public.commitment_wallet_plans
  WHERE cohort_id = p_cohort_id;

  SELECT COALESCE(SUM(points_awarded), 0)::INTEGER
  INTO v_team_points
  FROM public.commitment_wallet_events
  WHERE cohort_id = p_cohort_id;

  IF v_plan.id IS NOT NULL THEN
    WITH contributions AS (
      SELECT
        plan.user_id,
        COALESCE(SUM(event.points_awarded), 0)::INTEGER AS points
      FROM public.commitment_wallet_plans AS plan
      LEFT JOIN public.commitment_wallet_events AS event
        ON event.plan_id = plan.id
      WHERE plan.cohort_id = p_cohort_id
      GROUP BY plan.id, plan.user_id
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
    'personalPoints', v_personal_points,
    'personalMaximumPoints', v_personal_maximum,
    'commitmentScore', v_score,
    'teamPoints', v_team_points,
    'teamMaximumPoints', v_team_maximum,
    'teamMemberCount', v_team_members,
    'contributionRank', v_rank
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_commitment_wallet(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_commitment_wallet(UUID) TO authenticated;

COMMENT ON TABLE public.commitment_wallet_plans IS
  'Frozen finalised participant plans. Maximum points equal planned actions multiplied by 50; no starting points exist.';
COMMENT ON TABLE public.commitment_wallet_events IS
  'One Wallet outcome per committed action. Only completed_on_time awards 50 cohort points.';
COMMENT ON COLUMN public.user_actions.completed_late IS
  'True when completion occurred after the assigned IST date; Wallet score and points are never restored.';

-- Backfill already-active and archived cohort plans without granting any
-- initial points. Historical outcomes contribute only where their stored dates
-- can establish on-time completion; otherwise a success is treated as late.
INSERT INTO public.commitment_wallet_plans (
  user_id, cohort_id, subscription_id, planned_actions,
  maximum_points, finalised_at
)
SELECT
  subscription.user_id,
  subscription.cohort_id,
  subscription.id,
  COUNT(action.id)::INTEGER,
  COUNT(action.id)::INTEGER * 50,
  COALESCE(subscription.archived_at, subscription.updated_at, NOW())
FROM public.personal_action_subscriptions AS subscription
JOIN public.actions AS action
  ON action.created_by = subscription.user_id
 AND action.cohort_id = subscription.cohort_id
 AND action.is_personal = TRUE
WHERE subscription.cohort_id IS NOT NULL
  AND (subscription.is_active = TRUE OR subscription.archived_at IS NOT NULL)
GROUP BY
  subscription.id,
  subscription.user_id,
  subscription.cohort_id,
  subscription.archived_at,
  subscription.updated_at
HAVING COUNT(action.id) > 0
ON CONFLICT (user_id, cohort_id) DO NOTHING;

INSERT INTO public.commitment_wallet_actions (
  action_id, plan_id, user_id, cohort_id, points
)
SELECT
  action.id,
  plan.id,
  plan.user_id,
  plan.cohort_id,
  50
FROM public.commitment_wallet_plans AS plan
JOIN public.actions AS action
  ON action.created_by = plan.user_id
 AND action.cohort_id = plan.cohort_id
 AND action.is_personal = TRUE
ON CONFLICT (action_id) DO NOTHING;

UPDATE public.user_actions AS user_action
SET completed_at = CASE
      WHEN user_action.status = 'success' THEN COALESCE(user_action.completed_at, user_action.accepted_at)
      ELSE user_action.completed_at
    END,
    completed_late = CASE
      WHEN user_action.status = 'success' THEN NOT (
        user_action.scheduled_at IS NOT NULL
        AND user_action.accepted_at IS NOT NULL
        AND (user_action.scheduled_at AT TIME ZONE 'Asia/Kolkata')::DATE
            = (user_action.accepted_at AT TIME ZONE 'Asia/Kolkata')::DATE
      )
      ELSE user_action.completed_late
    END,
    missed_at = CASE
      WHEN user_action.status IN ('failed', 'skipped') THEN COALESCE(user_action.missed_at, user_action.updated_at, NOW())
      WHEN user_action.status = 'success' AND NOT (
        user_action.scheduled_at IS NOT NULL
        AND user_action.accepted_at IS NOT NULL
        AND (user_action.scheduled_at AT TIME ZONE 'Asia/Kolkata')::DATE
            = (user_action.accepted_at AT TIME ZONE 'Asia/Kolkata')::DATE
      ) THEN COALESCE(user_action.missed_at, user_action.accepted_at, NOW())
      ELSE user_action.missed_at
    END
FROM public.commitment_wallet_actions AS wallet_action
WHERE wallet_action.action_id = user_action.action_id
  AND wallet_action.user_id = user_action.user_id
  AND user_action.status IN ('success', 'failed', 'skipped');

INSERT INTO public.commitment_wallet_events (
  plan_id, user_action_id, action_id, user_id, cohort_id,
  event_type, points_awarded, settled_at, completed_at
)
SELECT
  wallet_action.plan_id,
  user_action.id,
  user_action.action_id,
  user_action.user_id,
  wallet_action.cohort_id,
  CASE
    WHEN user_action.status = 'success'
      AND user_action.scheduled_at IS NOT NULL
      AND user_action.accepted_at IS NOT NULL
      AND (user_action.scheduled_at AT TIME ZONE 'Asia/Kolkata')::DATE
          = (user_action.accepted_at AT TIME ZONE 'Asia/Kolkata')::DATE
      THEN 'completed_on_time'
    WHEN user_action.status = 'success' THEN 'completed_late'
    ELSE 'missed'
  END,
  CASE
    WHEN user_action.status = 'success'
      AND user_action.scheduled_at IS NOT NULL
      AND user_action.accepted_at IS NOT NULL
      AND (user_action.scheduled_at AT TIME ZONE 'Asia/Kolkata')::DATE
          = (user_action.accepted_at AT TIME ZONE 'Asia/Kolkata')::DATE
      THEN 50
    ELSE 0
  END,
  COALESCE(user_action.completed_at, user_action.missed_at, user_action.accepted_at, NOW()),
  CASE WHEN user_action.status = 'success' THEN user_action.completed_at ELSE NULL END
FROM public.user_actions AS user_action
JOIN public.commitment_wallet_actions AS wallet_action
  ON wallet_action.action_id = user_action.action_id
 AND wallet_action.user_id = user_action.user_id
WHERE user_action.status IN ('success', 'failed', 'skipped')
ON CONFLICT (action_id) DO NOTHING;
