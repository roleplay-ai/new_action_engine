-- Cohort action points are a savings-style score:
--   * every participant begins a cohort plan at 1,000;
--   * the plan's actions divide those 1,000 points exactly, using whole numbers;
--   * completing on the assigned IST date adds that action's allocation;
--   * missing the assigned date deducts it; completing later records completion
--     but never restores or awards points.

ALTER TABLE public.user_actions
  ADD COLUMN IF NOT EXISTS points_delta INTEGER,
  ADD COLUMN IF NOT EXISTS points_settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_late BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS missed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.cohort_point_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.personal_action_subscriptions(id) ON DELETE SET NULL,
  starting_points INTEGER NOT NULL DEFAULT 1000 CHECK (starting_points = 1000),
  current_points INTEGER NOT NULL DEFAULT 1000 CHECK (current_points BETWEEN 0 AND 2000),
  maximum_points INTEGER NOT NULL DEFAULT 2000 CHECK (maximum_points = 2000),
  planned_actions INTEGER NOT NULL CHECK (planned_actions > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, cohort_id)
);

CREATE TABLE IF NOT EXISTS public.personal_action_point_allocations (
  action_id UUID PRIMARY KEY REFERENCES public.actions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.cohort_point_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  points INTEGER NOT NULL CHECK (points > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.action_point_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.cohort_point_accounts(id) ON DELETE CASCADE,
  user_action_id UUID NOT NULL UNIQUE REFERENCES public.user_actions(id) ON DELETE CASCADE,
  action_id UUID NOT NULL REFERENCES public.actions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('completed_on_time', 'missed', 'completed_without_assignment')),
  points_delta INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cohort_point_accounts_cohort_score
  ON public.cohort_point_accounts(cohort_id, current_points DESC);
CREATE INDEX IF NOT EXISTS idx_action_point_allocations_account
  ON public.personal_action_point_allocations(account_id);
CREATE INDEX IF NOT EXISTS idx_action_point_events_account_created
  ON public.action_point_events(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_actions_unsettled_scheduled
  ON public.user_actions(scheduled_at)
  WHERE status = 'scheduled' AND points_settled_at IS NULL;

ALTER TABLE public.cohort_point_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_action_point_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_point_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own cohort point accounts" ON public.cohort_point_accounts;
CREATE POLICY "Users read own cohort point accounts" ON public.cohort_point_accounts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own personal action allocations" ON public.personal_action_point_allocations;
CREATE POLICY "Users read own personal action allocations" ON public.personal_action_point_allocations
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own action point events" ON public.action_point_events;
CREATE POLICY "Users read own action point events" ON public.action_point_events
  FOR SELECT USING (auth.uid() = user_id);

-- Allocate whole numbers deterministically. For example, a 24-action plan gets
-- sixteen 42-point actions and eight 41-point actions, totalling exactly 1,000.
CREATE OR REPLACE FUNCTION public.activate_my_personal_action_plan_with_points(
  p_cohort_id UUID,
  p_next_delivery_at TIMESTAMPTZ
)
RETURNS TABLE (planned_actions INTEGER, current_points INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_subscription public.personal_action_subscriptions%ROWTYPE;
  v_account_id UUID;
  v_action_count INTEGER;
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

  IF v_action_count < 1 OR v_action_count > 1000 THEN
    RAISE EXCEPTION 'A plan must contain between 1 and 1000 actions';
  END IF;

  INSERT INTO public.cohort_point_accounts (
    user_id, cohort_id, subscription_id, starting_points,
    current_points, maximum_points, planned_actions
  ) VALUES (
    v_user_id, p_cohort_id, v_subscription.id, 1000, 1000, 2000, v_action_count
  )
  ON CONFLICT (user_id, cohort_id) DO UPDATE
    SET subscription_id = EXCLUDED.subscription_id,
        planned_actions = EXCLUDED.planned_actions,
        updated_at = NOW()
  RETURNING id INTO v_account_id;

  -- Once any action has settled, allocations are immutable. This makes a
  -- repeated activation call idempotent and prevents a score from being reset.
  IF NOT EXISTS (
    SELECT 1 FROM public.action_point_events WHERE account_id = v_account_id
  ) THEN
    DELETE FROM public.personal_action_point_allocations
    WHERE account_id = v_account_id;

    INSERT INTO public.personal_action_point_allocations (
      action_id, account_id, user_id, cohort_id, points
    )
    SELECT
      ranked.id,
      v_account_id,
      v_user_id,
      p_cohort_id,
      (1000 / v_action_count)
        + CASE WHEN ranked.position <= (1000 % v_action_count) THEN 1 ELSE 0 END
    FROM (
      SELECT
        id,
        ROW_NUMBER() OVER (ORDER BY plan_order ASC NULLS LAST, created_at, id)::INTEGER AS position
      FROM public.actions
      WHERE created_by = v_user_id
        AND cohort_id = p_cohort_id
        AND is_personal = TRUE
    ) AS ranked;
  END IF;

  UPDATE public.personal_action_subscriptions
  SET is_active = TRUE,
      next_delivery_at = p_next_delivery_at,
      last_delivered_at = NULL,
      updated_at = NOW()
  WHERE id = v_subscription.id;

  RETURN QUERY
  SELECT account.planned_actions, account.current_points
  FROM public.cohort_point_accounts AS account
  WHERE account.id = v_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_my_personal_action_plan_with_points(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_my_personal_action_plan_with_points(UUID, TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.settle_my_personal_action(
  p_action_id UUID,
  p_success BOOLEAN,
  p_reflection TEXT DEFAULT NULL
)
RETURNS TABLE (points_delta INTEGER, current_points INTEGER, completed_late BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_allocation public.personal_action_point_allocations%ROWTYPE;
  v_user_action public.user_actions%ROWTYPE;
  v_user_action_id UUID;
  v_delta INTEGER := 0;
  v_late BOOLEAN := FALSE;
  v_now TIMESTAMPTZ := NOW();
  v_event_type TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT allocation.* INTO v_allocation
  FROM public.personal_action_point_allocations AS allocation
  WHERE allocation.action_id = p_action_id
    AND allocation.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This action is not part of your scored cohort plan';
  END IF;

  SELECT user_action.* INTO v_user_action
  FROM public.user_actions AS user_action
  WHERE user_action.user_id = v_user_id
    AND user_action.action_id = p_action_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_actions (
      user_id, action_id, cohort_id, status, accepted_at, reflection,
      completed_at, completed_late, points_delta, points_settled_at
    ) VALUES (
      v_user_id, p_action_id, v_allocation.cohort_id,
      CASE WHEN p_success THEN 'success'::public.action_status ELSE 'failed'::public.action_status END,
      v_now, NULLIF(BTRIM(COALESCE(p_reflection, '')), ''),
      CASE WHEN p_success THEN v_now ELSE NULL END,
      p_success, 0, v_now
    )
    RETURNING id INTO v_user_action_id;

    INSERT INTO public.action_point_events (
      account_id, user_action_id, action_id, user_id, cohort_id, event_type, points_delta
    ) VALUES (
      v_allocation.account_id, v_user_action_id, p_action_id, v_user_id,
      v_allocation.cohort_id, 'completed_without_assignment', 0
    );
    v_late := p_success;
  ELSE
    v_user_action_id := v_user_action.id;

    IF v_user_action.points_settled_at IS NOT NULL THEN
      -- A missed action stays deducted. A later success only changes its
      -- completion record; it never creates a second point event.
      IF p_success THEN
        UPDATE public.user_actions
        SET status = 'success',
            accepted_at = COALESCE(accepted_at, v_now),
            completed_at = COALESCE(completed_at, v_now),
            completed_late = completed_late OR COALESCE(points_delta, 0) <= 0,
            reflection = COALESCE(NULLIF(BTRIM(COALESCE(p_reflection, '')), ''), reflection),
            updated_at = v_now
        WHERE id = v_user_action_id;
      ELSE
        UPDATE public.user_actions
        SET reflection = COALESCE(NULLIF(BTRIM(COALESCE(p_reflection, '')), ''), reflection),
            updated_at = v_now
        WHERE id = v_user_action_id;
      END IF;

      RETURN QUERY
      SELECT
        COALESCE(v_user_action.points_delta, 0),
        account.current_points,
        CASE WHEN p_success THEN v_user_action.completed_late OR COALESCE(v_user_action.points_delta, 0) <= 0 ELSE v_user_action.completed_late END
      FROM public.cohort_point_accounts AS account
      WHERE account.id = v_allocation.account_id;
      RETURN;
    END IF;

    v_late := v_user_action.scheduled_at IS NULL
      OR (v_user_action.scheduled_at AT TIME ZONE 'Asia/Kolkata')::DATE
         <> (v_now AT TIME ZONE 'Asia/Kolkata')::DATE;

    IF p_success AND NOT v_late THEN
      v_delta := v_allocation.points;
      v_event_type := 'completed_on_time';
    ELSE
      v_delta := -v_allocation.points;
      v_event_type := 'missed';
    END IF;

    UPDATE public.cohort_point_accounts
    SET current_points = LEAST(maximum_points, GREATEST(0, current_points + v_delta)),
        updated_at = v_now
    WHERE id = v_allocation.account_id;

    UPDATE public.user_actions
    SET status = CASE WHEN p_success THEN 'success'::public.action_status ELSE 'failed'::public.action_status END,
        accepted_at = COALESCE(accepted_at, v_now),
        reflection = NULLIF(BTRIM(COALESCE(p_reflection, '')), ''),
        completed_at = CASE WHEN p_success THEN v_now ELSE completed_at END,
        completed_late = p_success AND v_late,
        missed_at = CASE WHEN v_delta < 0 THEN v_now ELSE missed_at END,
        points_delta = v_delta,
        points_settled_at = v_now,
        updated_at = v_now
    WHERE id = v_user_action_id;

    INSERT INTO public.action_point_events (
      account_id, user_action_id, action_id, user_id, cohort_id, event_type, points_delta
    ) VALUES (
      v_allocation.account_id, v_user_action_id, p_action_id, v_user_id,
      v_allocation.cohort_id, v_event_type, v_delta
    ) ON CONFLICT (user_action_id) DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT v_delta, account.current_points, v_late
  FROM public.cohort_point_accounts AS account
  WHERE account.id = v_allocation.account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_my_personal_action(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_my_personal_action(UUID, BOOLEAN, TEXT) TO authenticated;

-- Settle all still-scheduled actions whose assigned IST calendar date has
-- passed. The completion RPC performs the same date check, so a late check-in
-- is correct even if it happens before the daily cron runs.
CREATE OR REPLACE FUNCTION public.expire_overdue_personal_actions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_expired INTEGER := 0;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  FOR v_row IN
    SELECT
      user_action.id AS user_action_id,
      user_action.action_id,
      user_action.user_id,
      allocation.account_id,
      allocation.cohort_id,
      allocation.points
    FROM public.user_actions AS user_action
    JOIN public.personal_action_point_allocations AS allocation
      ON allocation.action_id = user_action.action_id
     AND allocation.user_id = user_action.user_id
    WHERE user_action.status = 'scheduled'
      AND user_action.points_settled_at IS NULL
      AND user_action.scheduled_at IS NOT NULL
      AND (user_action.scheduled_at AT TIME ZONE 'Asia/Kolkata')::DATE
          < (v_now AT TIME ZONE 'Asia/Kolkata')::DATE
    FOR UPDATE OF user_action SKIP LOCKED
  LOOP
    UPDATE public.cohort_point_accounts
    SET current_points = GREATEST(0, current_points - v_row.points),
        updated_at = v_now
    WHERE id = v_row.account_id;

    UPDATE public.user_actions
    SET status = 'failed',
        reflection = COALESCE(reflection, 'Not completed on the assigned day'),
        missed_at = v_now,
        points_delta = -v_row.points,
        points_settled_at = v_now,
        updated_at = v_now
    WHERE id = v_row.user_action_id
      AND points_settled_at IS NULL;

    IF FOUND THEN
      INSERT INTO public.action_point_events (
        account_id, user_action_id, action_id, user_id, cohort_id, event_type, points_delta
      ) VALUES (
        v_row.account_id, v_row.user_action_id, v_row.action_id, v_row.user_id,
        v_row.cohort_id, 'missed', -v_row.points
      ) ON CONFLICT (user_action_id) DO NOTHING;
      v_expired := v_expired + 1;
    END IF;
  END LOOP;

  RETURN v_expired;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_overdue_personal_actions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_overdue_personal_actions() TO service_role;

COMMENT ON TABLE public.cohort_point_accounts IS
  'One immutable-start, 0-2000 point balance per participant and cohort plan.';
COMMENT ON TABLE public.personal_action_point_allocations IS
  'Whole-number action values which always total 1000 for a finalised cohort plan.';
COMMENT ON COLUMN public.user_actions.completed_late IS
  'True when the action was completed after its assigned IST day; no points are restored or awarded.';

-- Initialise existing cohort plans at 1,000 without attempting to reinterpret
-- legacy completions whose original assigned date may no longer be available.
INSERT INTO public.cohort_point_accounts (
  user_id, cohort_id, subscription_id, starting_points,
  current_points, maximum_points, planned_actions
)
SELECT
  subscription.user_id,
  subscription.cohort_id,
  subscription.id,
  1000,
  1000,
  2000,
  COUNT(action.id)::INTEGER
FROM public.personal_action_subscriptions AS subscription
JOIN public.actions AS action
  ON action.created_by = subscription.user_id
 AND action.cohort_id = subscription.cohort_id
 AND action.is_personal = TRUE
WHERE subscription.cohort_id IS NOT NULL
GROUP BY subscription.id, subscription.user_id, subscription.cohort_id
ON CONFLICT (user_id, cohort_id) DO NOTHING;

WITH ranked AS (
  SELECT
    action.id AS action_id,
    account.id AS account_id,
    action.created_by AS user_id,
    action.cohort_id,
    COUNT(*) OVER (PARTITION BY action.created_by, action.cohort_id)::INTEGER AS action_count,
    ROW_NUMBER() OVER (
      PARTITION BY action.created_by, action.cohort_id
      ORDER BY action.plan_order ASC NULLS LAST, action.created_at, action.id
    )::INTEGER AS position
  FROM public.actions AS action
  JOIN public.cohort_point_accounts AS account
    ON account.user_id = action.created_by
   AND account.cohort_id = action.cohort_id
  WHERE action.is_personal = TRUE
)
INSERT INTO public.personal_action_point_allocations (
  action_id, account_id, user_id, cohort_id, points
)
SELECT
  ranked.action_id,
  ranked.account_id,
  ranked.user_id,
  ranked.cohort_id,
  (1000 / ranked.action_count)
    + CASE WHEN ranked.position <= (1000 % ranked.action_count) THEN 1 ELSE 0 END
FROM ranked
WHERE ranked.action_count BETWEEN 1 AND 1000
ON CONFLICT (action_id) DO NOTHING;
