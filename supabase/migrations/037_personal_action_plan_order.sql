-- Persist the participant's reviewed action sequence. The delivery worker uses
-- this order after finalisation, so drag-and-drop in the draft plan controls
-- which actions are released first.

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS plan_order INTEGER;

WITH ranked_actions AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY created_by, cohort_id
      ORDER BY created_at, id
    ) - 1 AS resolved_order
  FROM public.actions
  WHERE is_personal = TRUE
)
UPDATE public.actions AS action
SET plan_order = ranked_actions.resolved_order
FROM ranked_actions
WHERE action.id = ranked_actions.id
  AND action.plan_order IS NULL;

CREATE INDEX IF NOT EXISTS idx_personal_actions_plan_order
  ON public.actions(created_by, cohort_id, plan_order)
  WHERE is_personal = TRUE;

COMMENT ON COLUMN public.actions.plan_order IS
  'Zero-based participant-defined order for personal actions within a cohort plan.';

-- Reorder the whole draft atomically. The function refuses partial lists,
-- foreign actions, archived plans, and already-finalised plans.
CREATE OR REPLACE FUNCTION public.reorder_my_draft_personal_actions(
  p_cohort_id UUID,
  p_action_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_action_count INTEGER;
  v_unique_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.personal_action_subscriptions
    WHERE user_id = v_user_id
      AND cohort_id = p_cohort_id
      AND is_active = FALSE
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Only draft plans can be reordered';
  END IF;

  SELECT COUNT(*) INTO v_action_count
  FROM public.actions
  WHERE created_by = v_user_id
    AND cohort_id = p_cohort_id
    AND is_personal = TRUE;

  SELECT COUNT(DISTINCT action_id) INTO v_unique_count
  FROM UNNEST(COALESCE(p_action_ids, ARRAY[]::UUID[])) AS submitted(action_id);

  IF CARDINALITY(COALESCE(p_action_ids, ARRAY[]::UUID[])) <> v_action_count
     OR v_unique_count <> v_action_count
     OR EXISTS (
       SELECT 1
       FROM UNNEST(COALESCE(p_action_ids, ARRAY[]::UUID[])) AS submitted(action_id)
       WHERE NOT EXISTS (
         SELECT 1
         FROM public.actions AS action
         WHERE action.id = submitted.action_id
           AND action.created_by = v_user_id
           AND action.cohort_id = p_cohort_id
           AND action.is_personal = TRUE
       )
     ) THEN
    RAISE EXCEPTION 'The action list changed. Refresh the plan and try again.';
  END IF;

  UPDATE public.actions AS action
  SET plan_order = (ordered.ordinality - 1)::INTEGER
  FROM UNNEST(p_action_ids) WITH ORDINALITY AS ordered(action_id, ordinality)
  WHERE action.id = ordered.action_id
    AND action.created_by = v_user_id
    AND action.cohort_id = p_cohort_id
    AND action.is_personal = TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_my_draft_personal_actions(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_my_draft_personal_actions(UUID, UUID[]) TO authenticated;
