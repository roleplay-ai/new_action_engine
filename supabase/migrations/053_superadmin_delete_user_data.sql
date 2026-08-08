-- Superadmin hard-delete: unblock profile removal and purge user-owned data.
--
-- Attribution columns (created_by / added_by / assigned_by) previously used the
-- default NO ACTION FK behavior, so deleting a user who authored company
-- content failed. Those links become SET NULL so shared company data remains.
-- Personal AI actions and memberships are removed explicitly by
-- purge_user_owned_data() before auth.admin.deleteUser().

-- ---------------------------------------------------------------------------
-- 1. Attribution FKs → ON DELETE SET NULL
-- ---------------------------------------------------------------------------

ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_created_by_fkey;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.actions DROP CONSTRAINT IF EXISTS actions_created_by_fkey;
ALTER TABLE public.actions
  ADD CONSTRAINT actions_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.packages DROP CONSTRAINT IF EXISTS packages_created_by_fkey;
ALTER TABLE public.packages
  ADD CONSTRAINT packages_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.cohorts DROP CONSTRAINT IF EXISTS cohorts_created_by_fkey;
ALTER TABLE public.cohorts
  ADD CONSTRAINT cohorts_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.cohort_members DROP CONSTRAINT IF EXISTS cohort_members_added_by_fkey;
ALTER TABLE public.cohort_members
  ADD CONSTRAINT cohort_members_added_by_fkey
  FOREIGN KEY (added_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.prepare_content_items DROP CONSTRAINT IF EXISTS prepare_content_items_created_by_fkey;
ALTER TABLE public.prepare_content_items
  ADD CONSTRAINT prepare_content_items_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.cohort_prepare_assignments DROP CONSTRAINT IF EXISTS cohort_prepare_assignments_assigned_by_fkey;
ALTER TABLE public.cohort_prepare_assignments
  ADD CONSTRAINT cohort_prepare_assignments_assigned_by_fkey
  FOREIGN KEY (assigned_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.trainers DROP CONSTRAINT IF EXISTS trainers_created_by_fkey;
ALTER TABLE public.trainers
  ADD CONSTRAINT trainers_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. Purge user-owned data (called before auth user delete)
-- ---------------------------------------------------------------------------

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
  DELETE FROM public.action_reminders WHERE user_id = p_user_id;
  DELETE FROM public.action_reminder_completions WHERE user_id = p_user_id;
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
