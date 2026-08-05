-- Fixed cohort action scoring:
--   * every participant begins at 1,000 points;
--   * every action has a fixed 50-point value;
--   * completing on the assigned IST date awards 100 points;
--   * missing the assigned date deducts 50 points, with a floor of zero;
--   * completing later records completion but does not restore the deduction.

ALTER TABLE public.cohort_point_accounts
  DROP CONSTRAINT IF EXISTS cohort_point_accounts_current_points_check,
  DROP CONSTRAINT IF EXISTS cohort_point_accounts_maximum_points_check;

ALTER TABLE public.cohort_point_accounts
  ADD CONSTRAINT cohort_point_accounts_current_points_check
    CHECK (current_points >= 0),
  ADD CONSTRAINT cohort_point_accounts_maximum_points_check
    CHECK (maximum_points >= starting_points);

-- Preserve settled history. Only actions which have not produced a point event
-- move to the new fixed 50-point value.
UPDATE public.personal_action_point_allocations AS allocation
SET points = 50
WHERE NOT EXISTS (
  SELECT 1
  FROM public.action_point_events AS event
  WHERE event.action_id = allocation.action_id
    AND event.user_id = allocation.user_id
);

UPDATE public.cohort_point_accounts
SET maximum_points = GREATEST(
      current_points,
      starting_points + (planned_actions * 100)
    ),
    updated_at = NOW();

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
    v_user_id, p_cohort_id, v_subscription.id,
    1000, 1000, 1000 + (v_action_count * 100), v_action_count
  )
  ON CONFLICT (user_id, cohort_id) DO UPDATE
    SET subscription_id = EXCLUDED.subscription_id,
        planned_actions = EXCLUDED.planned_actions,
        maximum_points = GREATEST(
          cohort_point_accounts.current_points,
          1000 + (EXCLUDED.planned_actions * 100)
        ),
        updated_at = NOW()
  RETURNING id INTO v_account_id;

  -- Once any action has settled, allocations remain immutable. Repeated
  -- activation is idempotent and cannot reset an earned balance.
  IF NOT EXISTS (
    SELECT 1 FROM public.action_point_events WHERE account_id = v_account_id
  ) THEN
    DELETE FROM public.personal_action_point_allocations
    WHERE account_id = v_account_id;

    INSERT INTO public.personal_action_point_allocations (
      action_id, account_id, user_id, cohort_id, points
    )
    SELECT
      action.id,
      v_account_id,
      v_user_id,
      p_cohort_id,
      50
    FROM public.actions AS action
    WHERE action.created_by = v_user_id
      AND action.cohort_id = p_cohort_id
      AND action.is_personal = TRUE;
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
      -- A missed action stays deducted. A later success changes only its
      -- completion record and never creates a second point event.
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
      v_delta := 100;
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

COMMENT ON TABLE public.cohort_point_accounts IS
  'A cohort score which starts at 1,000, awards 100 for on-time completion, and never falls below zero.';
COMMENT ON TABLE public.personal_action_point_allocations IS
  'Fixed 50-point values used for missed-action deductions in a finalised cohort plan.';
