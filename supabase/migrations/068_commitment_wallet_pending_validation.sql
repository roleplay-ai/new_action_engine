-- Pending validation for auto-expired Commitment Wallet actions
--
-- Today, "Didn't complete" mixes two very different situations: a
-- participant explicitly saying "I didn't do it", and the daily scheduler
-- silently failing an action because its assigned IST date passed with no
-- check-in at all. The latter deserves its own recoverable state: the
-- participant may well have done the action and simply never opened the app
-- to confirm it. This adds a flag the scheduler sets (and nothing else does),
-- plus a settlement path that — unlike a normal late completion — restores
-- the missed commitment share and awards the Team Action Bank its points,
-- because the action is being validated as genuinely done, not just recorded
-- after the fact.

ALTER TABLE public.user_actions
  ADD COLUMN IF NOT EXISTS auto_expired BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.user_actions.auto_expired IS
  'True only when expire_overdue_commitment_wallet_actions() failed this action because its date passed with no check-in. Cleared once the participant resolves it (validates it as done, or confirms the miss). Actions/tabs use this to route into "Pending validation" instead of "Didn''t complete".';

-- Widen the event-type vocabulary so a validated pending-validation action is
-- distinguishable from an ordinary completed_on_time settlement, while still
-- being excluded from the "missed" filters used by the score formula and the
-- cohort/team point totals (both already key off explicit IN (...) lists, so
-- a new type is automatically excluded from "missed" without touching them).
ALTER TABLE public.commitment_wallet_events
  DROP CONSTRAINT IF EXISTS commitment_wallet_events_event_type_check;
ALTER TABLE public.commitment_wallet_events
  ADD CONSTRAINT commitment_wallet_events_event_type_check
  CHECK (event_type IN ('completed_on_time', 'missed', 'completed_late', 'validated_late'));

COMMENT ON COLUMN public.commitment_wallet_events.event_type IS
  'completed_on_time and validated_late both award points and count toward the Commitment Score; missed and completed_late do not. validated_late is a missed action the participant later confirmed as actually done via the Pending validation flow.';

-- Mark the actions this sweep fails as auto-expired, so the client can route
-- them into "Pending validation" instead of "Didn't complete".
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
        auto_expired = TRUE,
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

-- Validate a pending-validation action as actually done. Only actions the
-- scheduler auto-expired (never ones the participant explicitly marked
-- skipped/failed) are eligible, and only once: this is a settlement, not a
-- second chance at editing an existing one. Unlike settle_my_commitment_wallet_action,
-- this restores the action's commitment share and awards its 50 points to
-- the Team Action Bank, because the participant is confirming — not merely
-- recording after the fact — that the action happened.
CREATE OR REPLACE FUNCTION public.validate_my_commitment_wallet_action(
  p_action_id UUID,
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
  v_now TIMESTAMPTZ := NOW();
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

  IF NOT FOUND OR v_user_action.status <> 'failed' OR NOT v_user_action.auto_expired THEN
    RAISE EXCEPTION 'This action is not awaiting validation';
  END IF;

  SELECT * INTO v_event
  FROM public.commitment_wallet_events
  WHERE action_id = p_action_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_event.event_type <> 'missed' THEN
    RAISE EXCEPTION 'This action has already been settled';
  END IF;

  UPDATE public.user_actions
  SET status = 'success'::public.action_status,
      completed_at = v_now,
      completed_late = TRUE,
      auto_expired = FALSE,
      reflection = COALESCE(NULLIF(BTRIM(COALESCE(p_reflection, '')), ''), reflection),
      updated_at = v_now
  WHERE id = v_user_action.id;

  UPDATE public.commitment_wallet_events
  SET event_type = 'validated_late',
      points_awarded = 50,
      completed_at = v_now,
      updated_at = v_now
  WHERE id = v_event.id;

  RETURN QUERY SELECT 50, TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_my_commitment_wallet_action(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_my_commitment_wallet_action(UUID, TEXT) TO authenticated;

-- Confirm a pending-validation action really wasn't done. No wallet event
-- changes (it stays a 0-point "missed" settlement); this just clears the
-- flag so the action moves from "Pending validation" into "Didn't complete"
-- for good.
CREATE OR REPLACE FUNCTION public.dismiss_my_commitment_wallet_validation(
  p_action_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.user_actions
  SET auto_expired = FALSE,
      updated_at = NOW()
  WHERE user_id = v_user_id
    AND action_id = p_action_id
    AND status = 'failed'
    AND auto_expired = TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_my_commitment_wallet_validation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dismiss_my_commitment_wallet_validation(UUID) TO authenticated;
