-- Current actions stay in "Current actions" until the next delivery cycle
-- releases a fresh batch. Only then do unfinished scheduled actions move to
-- Pending validation (failed + auto_expired). Date alone no longer retires them.

-- Retire every still-scheduled action for one participant+cohort when their
-- next batch is about to land. Wallet actions get a missed settlement +
-- auto_expired; legacy personal-point allocations settle points the same way
-- expire_overdue_personal_actions() used to.
CREATE OR REPLACE FUNCTION public.expire_scheduled_actions_for_delivery(
  p_user_id UUID,
  p_cohort_id UUID
)
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
  IF p_user_id IS NULL OR p_cohort_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Commitment Wallet path → Pending validation
  FOR v_row IN
    SELECT
      user_action.id AS user_action_id,
      user_action.action_id,
      wallet_action.plan_id,
      wallet_action.cohort_id
    FROM public.user_actions AS user_action
    JOIN public.commitment_wallet_actions AS wallet_action
      ON wallet_action.action_id = user_action.action_id
     AND wallet_action.user_id = user_action.user_id
    LEFT JOIN public.commitment_wallet_events AS event
      ON event.action_id = user_action.action_id
     AND event.user_id = user_action.user_id
    WHERE user_action.user_id = p_user_id
      AND user_action.cohort_id = p_cohort_id
      AND user_action.status = 'scheduled'
      AND event.id IS NULL
    FOR UPDATE OF user_action SKIP LOCKED
  LOOP
    UPDATE public.user_actions
    SET status = 'failed'::public.action_status,
        reflection = COALESCE(reflection, 'Not completed before the next actions arrived'),
        missed_at = v_now,
        auto_expired = TRUE,
        updated_at = v_now
    WHERE id = v_row.user_action_id;

    INSERT INTO public.commitment_wallet_events (
      plan_id, user_action_id, action_id, user_id, cohort_id,
      event_type, points_awarded, settled_at
    ) VALUES (
      v_row.plan_id, v_row.user_action_id, v_row.action_id, p_user_id,
      v_row.cohort_id, 'missed', 0, v_now
    ) ON CONFLICT (action_id) DO NOTHING;

    IF FOUND THEN
      v_expired := v_expired + 1;
    END IF;
  END LOOP;

  -- Legacy personal-point allocations (plans without a Wallet row still settle)
  FOR v_row IN
    SELECT
      user_action.id AS user_action_id,
      user_action.action_id,
      allocation.account_id,
      allocation.cohort_id,
      allocation.points
    FROM public.user_actions AS user_action
    JOIN public.personal_action_point_allocations AS allocation
      ON allocation.action_id = user_action.action_id
     AND allocation.user_id = user_action.user_id
    LEFT JOIN public.commitment_wallet_actions AS wallet_action
      ON wallet_action.action_id = user_action.action_id
     AND wallet_action.user_id = user_action.user_id
    WHERE user_action.user_id = p_user_id
      AND user_action.cohort_id = p_cohort_id
      AND user_action.status = 'scheduled'
      AND user_action.points_settled_at IS NULL
      AND wallet_action.action_id IS NULL
    FOR UPDATE OF user_action SKIP LOCKED
  LOOP
    UPDATE public.cohort_point_accounts
    SET current_points = GREATEST(0, current_points - v_row.points),
        updated_at = v_now
    WHERE id = v_row.account_id;

    UPDATE public.user_actions
    SET status = 'failed'::public.action_status,
        reflection = COALESCE(reflection, 'Not completed before the next actions arrived'),
        missed_at = v_now,
        auto_expired = TRUE,
        points_delta = -v_row.points,
        points_settled_at = v_now,
        updated_at = v_now
    WHERE id = v_row.user_action_id
      AND points_settled_at IS NULL;

    IF FOUND THEN
      INSERT INTO public.action_point_events (
        account_id, user_action_id, action_id, user_id, cohort_id, event_type, points_delta
      ) VALUES (
        v_row.account_id, v_row.user_action_id, v_row.action_id, p_user_id,
        v_row.cohort_id, 'missed', -v_row.points
      ) ON CONFLICT (user_action_id) DO NOTHING;
      v_expired := v_expired + 1;
    END IF;
  END LOOP;

  RETURN v_expired;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_scheduled_actions_for_delivery(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_scheduled_actions_for_delivery(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.expire_scheduled_actions_for_delivery(UUID, UUID) IS
  'Moves still-scheduled Current actions into Pending validation when the next delivery batch is released. Called from assignScheduledBatch — not on calendar date alone.';

-- Cron safety net: only retire Current actions for participants whose next
-- delivery is due (same moment a fresh batch is about to land). No longer
-- fails actions solely because their scheduled IST date has passed.
CREATE OR REPLACE FUNCTION public.expire_overdue_commitment_wallet_actions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_total INTEGER := 0;
  v_n INTEGER;
BEGIN
  FOR v_sub IN
    SELECT DISTINCT user_id, cohort_id
    FROM public.personal_action_subscriptions
    WHERE is_active = TRUE
      AND archived_at IS NULL
      AND cohort_id IS NOT NULL
      AND next_delivery_at <= v_now
  LOOP
    SELECT public.expire_scheduled_actions_for_delivery(v_sub.user_id, v_sub.cohort_id)
      INTO v_n;
    v_total := v_total + COALESCE(v_n, 0);
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_overdue_commitment_wallet_actions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_overdue_commitment_wallet_actions() TO service_role;

-- Personal-point cron entry point: same delivery-tied rule (Wallet path above
-- already covers most active plans; this catches legacy allocation-only rows
-- for due deliveries).
CREATE OR REPLACE FUNCTION public.expire_overdue_personal_actions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_total INTEGER := 0;
  v_n INTEGER;
BEGIN
  FOR v_sub IN
    SELECT DISTINCT user_id, cohort_id
    FROM public.personal_action_subscriptions
    WHERE is_active = TRUE
      AND archived_at IS NULL
      AND cohort_id IS NOT NULL
      AND next_delivery_at <= v_now
  LOOP
    SELECT public.expire_scheduled_actions_for_delivery(v_sub.user_id, v_sub.cohort_id)
      INTO v_n;
    v_total := v_total + COALESCE(v_n, 0);
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_overdue_personal_actions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_overdue_personal_actions() TO service_role;

COMMENT ON COLUMN public.user_actions.auto_expired IS
  'True only when Current actions were retired because the next delivery batch arrived (expire_scheduled_actions_for_delivery). Cleared once the participant resolves it (validates it as done, or confirms the miss). Actions/tabs use this to route into "Pending validation" instead of "Didn''t complete".';
