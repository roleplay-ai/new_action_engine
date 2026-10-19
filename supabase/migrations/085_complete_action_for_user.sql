-- Complete an action on a participant's behalf — used when they tap "Done"
-- on a WhatsApp reminder (lib/whatsapp-action-completion.ts), where there is
-- no logged-in session.
--
-- The settlement rules live in the participant-facing RPCs, which identify
-- the caller through auth.uid(): settle_my_personal_action (older scored
-- plans), settle_my_commitment_wallet_action (on time / late),
-- validate_my_commitment_wallet_action (Pending validation → validated) and
-- unlock_my_surprise_box. Rather than duplicating those rules, this function
-- sets the request's JWT subject to p_user_id for the rest of the transaction
-- and calls them, choosing between them exactly like completeAction() in
-- app/actions/user-actions.ts. Profile points and the feed event are added by
-- the caller, as completeAction does.
--
-- Service role only: it acts as any user, so it must never be callable from
-- a browser session.

CREATE OR REPLACE FUNCTION public.complete_action_for_user(
  p_user_id UUID,
  p_action_id UUID
)
RETURNS TABLE (
  result TEXT,              -- 'completed' | 'already_done' | 'not_assigned' | 'unsupported'
  settle_path TEXT,         -- 'legacy' | 'wallet' | 'validated' (when completed)
  points_added INTEGER,
  completed_late BOOLEAN,
  surprise_unlock_id UUID,
  previous_status TEXT,
  action_title TEXT,
  action_cohort_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.actions%ROWTYPE;
  v_user_action public.user_actions%ROWTYPE;
  v_is_wallet BOOLEAN;
  v_points INTEGER := 0;
  v_late BOOLEAN := FALSE;
  v_path TEXT;
  v_unlock_id UUID;
BEGIN
  SELECT * INTO v_action FROM public.actions WHERE id = p_action_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_assigned'::TEXT, NULL::TEXT, 0, FALSE, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Reminders only list personal plan actions; anything else is completed in the app.
  IF NOT v_action.is_personal THEN
    RETURN QUERY SELECT 'unsupported'::TEXT, NULL::TEXT, 0, FALSE, NULL::UUID, NULL::TEXT, v_action.title, v_action.cohort_id;
    RETURN;
  END IF;

  SELECT * INTO v_user_action
  FROM public.user_actions
  WHERE user_id = p_user_id AND action_id = p_action_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_assigned'::TEXT, NULL::TEXT, 0, FALSE, NULL::UUID, NULL::TEXT, v_action.title, v_action.cohort_id;
    RETURN;
  END IF;

  IF v_user_action.status = 'success' THEN
    RETURN QUERY SELECT 'already_done'::TEXT, NULL::TEXT, 0, FALSE, NULL::UUID,
      v_user_action.status::TEXT, v_action.title, v_action.cohort_id;
    RETURN;
  END IF;

  -- Act as the participant for the rest of this transaction, so auth.uid()
  -- inside the *_my_* functions resolves to them (both setting styles are
  -- set, covering older and newer auth.uid() implementations).
  PERFORM set_config('request.jwt.claim.sub', p_user_id::TEXT, TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::TEXT, 'role', 'authenticated')::TEXT,
    TRUE
  );

  SELECT EXISTS (
    SELECT 1 FROM public.commitment_wallet_actions
    WHERE action_id = p_action_id AND user_id = p_user_id
  ) INTO v_is_wallet;

  IF v_action.cohort_id IS NOT NULL AND NOT v_is_wallet THEN
    -- Older plans scored through the cohort-points system.
    SELECT s.points_delta, s.completed_late INTO v_points, v_late
    FROM public.settle_my_personal_action(p_action_id, TRUE, NULL) AS s;
    v_path := 'legacy';
  ELSIF v_user_action.status = 'failed' AND v_user_action.auto_expired THEN
    -- Retired into Pending validation when the next batch arrived.
    SELECT s.points_added, s.completed_late INTO v_points, v_late
    FROM public.validate_my_commitment_wallet_action(p_action_id, NULL) AS s;
    v_path := 'validated';
  ELSE
    SELECT s.points_added, s.completed_late INTO v_points, v_late
    FROM public.settle_my_commitment_wallet_action(p_action_id, TRUE, NULL) AS s;
    v_path := 'wallet';
  END IF;

  -- Every success opens the action's Surprise Box (plans with boxes enabled).
  -- Best effort, as in completeAction: an unlock failure never fails completion.
  IF v_path <> 'legacy' THEN
    BEGIN
      SELECT u.id INTO v_unlock_id FROM public.unlock_my_surprise_box(p_action_id) AS u LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_unlock_id := NULL;
    END;
  END IF;

  RETURN QUERY SELECT 'completed'::TEXT, v_path, COALESCE(v_points, 0), COALESCE(v_late, FALSE), v_unlock_id,
    v_user_action.status::TEXT, v_action.title, v_action.cohort_id;
END;
$$;

-- Supabase's default privileges also grant new functions to anon and
-- authenticated directly, so revoking from PUBLIC alone is not enough here.
REVOKE ALL ON FUNCTION public.complete_action_for_user(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_action_for_user(UUID, UUID) TO service_role;
