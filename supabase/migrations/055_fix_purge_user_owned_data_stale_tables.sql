-- Fix purge_user_owned_data(): it still deleted from public.action_reminders and
-- public.action_reminder_completions, both of which were dropped in migration
-- 022_personal_action_subscriptions.sql (replaced by personal_action_subscriptions).
-- This made superadmin user deletion fail with:
--   relation "public.action_reminders" does not exist

CREATE OR REPLACE FUNCTION public.purge_user_owned_data(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thin_group_ids UUID[];
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required';
  END IF;

  -- Personal AI plan actions (dependents cascade via action_id FKs).
  DELETE FROM public.actions
  WHERE created_by = p_user_id
    AND is_personal = TRUE;

  -- Memberships, plans, ledger, reminders, prepare progress.
  DELETE FROM public.cohort_members WHERE user_id = p_user_id;
  DELETE FROM public.personal_action_subscriptions WHERE user_id = p_user_id;
  DELETE FROM public.personal_action_backlog WHERE user_id = p_user_id;
  DELETE FROM public.personal_action_generation_jobs WHERE user_id = p_user_id;
  DELETE FROM public.user_actions WHERE user_id = p_user_id;
  DELETE FROM public.package_assignments WHERE user_id = p_user_id;
  DELETE FROM public.feed_events WHERE user_id = p_user_id;
  DELETE FROM public.personal_action_reminder_logs WHERE user_id = p_user_id;
  DELETE FROM public.personal_action_reminder_claims WHERE user_id = p_user_id;
  DELETE FROM public.user_prepare_progress WHERE user_id = p_user_id;
  DELETE FROM public.user_quiz_attempts WHERE user_id = p_user_id;
  DELETE FROM public.participant_session_notes WHERE user_id = p_user_id;
  DELETE FROM public.cohort_messages WHERE sender_id = p_user_id;
  DELETE FROM public.trainer_expectations WHERE user_id = p_user_id;

  -- Commitment wallet / points / buddy score (also cascade from profiles).
  DELETE FROM public.commitment_wallet_events WHERE user_id = p_user_id;
  DELETE FROM public.commitment_wallet_actions WHERE user_id = p_user_id;
  DELETE FROM public.commitment_wallet_plans WHERE user_id = p_user_id;
  DELETE FROM public.commitment_wallet_score_snapshots WHERE user_id = p_user_id;
  DELETE FROM public.action_point_events WHERE user_id = p_user_id;
  DELETE FROM public.personal_action_point_allocations WHERE user_id = p_user_id;
  DELETE FROM public.cohort_point_accounts WHERE user_id = p_user_id;

  -- Buddy groups: remove membership, then dissolve empty / solo groups.
  SELECT COALESCE(array_agg(DISTINCT group_id), ARRAY[]::UUID[])
  INTO v_thin_group_ids
  FROM public.commitment_buddy_members
  WHERE user_id = p_user_id;

  DELETE FROM public.commitment_buddy_members WHERE user_id = p_user_id;

  IF cardinality(v_thin_group_ids) > 0 THEN
    DELETE FROM public.commitment_buddy_groups g
    WHERE g.id = ANY (v_thin_group_ids)
      AND (
        SELECT COUNT(*)::INTEGER
        FROM public.commitment_buddy_members m
        WHERE m.group_id = g.id
      ) < 2;
  END IF;

  -- Email schedule recipient arrays are not FK-backed.
  UPDATE public.email_schedules
  SET
    user_ids = array_remove(user_ids, p_user_id),
    updated_at = NOW()
  WHERE p_user_id = ANY (user_ids);
END;
$$;

COMMENT ON FUNCTION public.purge_user_owned_data(UUID) IS
  'Removes personal actions, subscriptions, cohort membership, and related user data before superadmin auth delete. Shared company content authorship is cleared via ON DELETE SET NULL FKs.';

REVOKE ALL ON FUNCTION public.purge_user_owned_data(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_user_owned_data(UUID) TO service_role;
