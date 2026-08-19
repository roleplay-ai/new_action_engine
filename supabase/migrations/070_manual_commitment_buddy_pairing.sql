-- Manual commitment-buddy pairing.
--
-- Replaces the automatic pair/trio generator (migration 041, updated by 051)
-- with superadmin-controlled, directional buddy assignments. A superadmin
-- picks who sees whose Commitment Score; nothing is auto-paired anymore.
--
-- Model: one row per (cohort, user) saying "this user's buddy is
-- buddy_user_id" (who they see on their Actions page). A regular pair is two
-- rows pointing at each other (A -> B, B -> A). A three-person cycle is three
-- rows chained together (A -> B -> C -> A) — each person sees exactly ONE
-- buddy, not both other members, unlike the old mutual-trio behaviour.
--
-- Per product decision, existing auto-generated pairs/trios are cleared: every
-- participant goes back to "waiting for a buddy" until a superadmin manually
-- pairs them.

CREATE TABLE public.commitment_buddy_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  buddy_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  revealed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (cohort_id, user_id),
  CONSTRAINT commitment_buddy_assignments_no_self_pair CHECK (user_id <> buddy_user_id)
);

CREATE INDEX idx_commitment_buddy_assignments_cohort ON public.commitment_buddy_assignments(cohort_id);
CREATE INDEX idx_commitment_buddy_assignments_buddy ON public.commitment_buddy_assignments(cohort_id, buddy_user_id);

ALTER TABLE public.commitment_buddy_assignments ENABLE ROW LEVEL SECURITY;

-- Direct table access reveals only the caller's own outgoing assignment.
-- Buddy names/scores are exposed solely through get_my_commitment_buddies()
-- below. Writes are superadmin-only and go through the service-role client
-- from app/actions (role checked server-side) — no INSERT/UPDATE/DELETE
-- policy is granted here.
CREATE POLICY "Users read own commitment buddy assignment" ON public.commitment_buddy_assignments
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.commitment_buddy_assignments IS
  'Manual, superadmin-assigned buddy pairing. One row per (cohort, user): user_id sees buddy_user_id''s Commitment Score. Pairs are two rows pointing at each other; a cycle (e.g. three people) chains rows A->B->C->A.';

-- Leaving a cohort removes that participant's own assignment, and also drops
-- any assignment that pointed at them (so nobody keeps seeing a departed
-- member's card). The other side of a broken pair/cycle is left unpaired for
-- a superadmin to reassign — never auto-reshuffled.
CREATE OR REPLACE FUNCTION public.remove_departed_commitment_buddy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.commitment_buddy_assignments
  WHERE cohort_id = OLD.cohort_id
    AND (user_id = OLD.user_id OR buddy_user_id = OLD.user_id);

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_departed_commitment_buddy() FROM PUBLIC;

DROP TRIGGER IF EXISTS cohort_member_commitment_buddy_cleanup ON public.cohort_members;
CREATE TRIGGER cohort_member_commitment_buddy_cleanup
  AFTER DELETE ON public.cohort_members
  FOR EACH ROW
  EXECUTE FUNCTION public.remove_departed_commitment_buddy();

-- Buddy card data, read from the manual assignment instead of an
-- auto-generated group. Same JSON shape as before (0 or 1 buddy in
-- `buddies`), so the Actions UI needs no changes.
CREATE OR REPLACE FUNCTION public.get_my_commitment_buddies(p_cohort_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_assignment_id UUID;
  v_buddy_user_id UUID;
  v_revealed_at TIMESTAMPTZ;
  v_buddies JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT assignment.id, assignment.buddy_user_id, assignment.revealed_at
  INTO v_assignment_id, v_buddy_user_id, v_revealed_at
  FROM public.commitment_buddy_assignments AS assignment
  WHERE assignment.cohort_id = p_cohort_id
    AND assignment.user_id = v_user_id;

  -- No assignment yet, or the assigned buddy has since left the cohort.
  IF v_buddy_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.cohort_members
    WHERE cohort_id = p_cohort_id AND user_id = v_buddy_user_id
  ) THEN
    RETURN JSONB_BUILD_OBJECT(
      'groupId', NULL,
      'groupSize', 0,
      'revealPending', FALSE,
      'buddies', '[]'::JSONB
    );
  END IF;

  SELECT JSONB_BUILD_ARRAY(
    JSONB_BUILD_OBJECT(
      'id', profile.id,
      'name', COALESCE(NULLIF(BTRIM(profile.full_name), ''), 'Cohort member'),
      'email', profile.email,
      'track', sub.track,
      'hasFinalisedPlan', wallet_plan.id IS NOT NULL,
      'plannedActions', COALESCE(wallet_plan.planned_actions, 0),
      'currentScore', CASE WHEN wallet_plan.id IS NOT NULL
        THEN public.commitment_wallet_plan_score(wallet_plan.id)
        ELSE NULL END,
      'previousScore', (
        SELECT snapshot.score
        FROM public.commitment_wallet_score_snapshots AS snapshot
        WHERE snapshot.user_id = profile.id
          AND snapshot.cohort_id = p_cohort_id
          AND snapshot.snapshot_date = CASE sub.track
            WHEN 'daily' THEN ((NOW() AT TIME ZONE 'Asia/Kolkata')::DATE - 1)
            WHEN 'weekly' THEN ((NOW() AT TIME ZONE 'Asia/Kolkata')::DATE - 7)
            ELSE NULL
          END
      )
    )
  )
  INTO v_buddies
  FROM public.profiles AS profile
  LEFT JOIN public.personal_action_subscriptions AS sub
    ON sub.cohort_id = p_cohort_id AND sub.user_id = profile.id
  LEFT JOIN public.commitment_wallet_plans AS wallet_plan
    ON wallet_plan.cohort_id = p_cohort_id AND wallet_plan.user_id = profile.id
  WHERE profile.id = v_buddy_user_id;

  RETURN JSONB_BUILD_OBJECT(
    'groupId', v_assignment_id,
    'groupSize', 2,
    'revealPending', v_revealed_at IS NULL,
    'buddies', COALESCE(v_buddies, '[]'::JSONB)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_commitment_buddies(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_commitment_buddies(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_my_commitment_buddy_revealed(p_cohort_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.commitment_buddy_assignments
  SET revealed_at = COALESCE(revealed_at, NOW())
  WHERE cohort_id = p_cohort_id
    AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.mark_my_commitment_buddy_revealed(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_my_commitment_buddy_revealed(UUID) TO authenticated;

-- Cron-safe email summary (migration 052): read the buddy from the manual
-- assignment instead of the old "earliest pairing in my group" lookup.
CREATE OR REPLACE FUNCTION public.get_commitment_wallet_email_summary(p_user_id UUID, p_cohort_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_plan public.commitment_wallet_plans%ROWTYPE;
  v_has_plan BOOLEAN := FALSE;
  v_current_score NUMERIC := NULL;
  v_team_maximum INTEGER := 0;
  v_team_plan_points INTEGER := 0;
  v_team_action_points INTEGER := 0;
  v_team_points INTEGER := 0;
  v_team_members INTEGER := 0;
  v_rank INTEGER := NULL;
  v_buddy_id UUID;
  v_buddy_name TEXT := NULL;
  v_buddy_plan_id UUID;
  v_buddy_score NUMERIC := NULL;
BEGIN
  SELECT * INTO v_plan
  FROM public.commitment_wallet_plans
  WHERE user_id = p_user_id AND cohort_id = p_cohort_id;
  v_has_plan := FOUND;
  IF v_has_plan THEN
    v_current_score := public.commitment_wallet_plan_score(v_plan.id);
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

  IF v_has_plan THEN
    WITH contributions AS (
      SELECT
        plan.user_id,
        plan.plan_bonus_points + COALESCE(SUM(event.points_awarded), 0)::INTEGER AS points
      FROM public.commitment_wallet_plans AS plan
      LEFT JOIN public.commitment_wallet_events AS event ON event.plan_id = plan.id
      WHERE plan.cohort_id = p_cohort_id
      GROUP BY plan.id, plan.user_id, plan.plan_bonus_points
    ), ranked AS (
      SELECT user_id, DENSE_RANK() OVER (ORDER BY points DESC)::INTEGER AS contribution_rank
      FROM contributions
    )
    SELECT contribution_rank INTO v_rank FROM ranked WHERE user_id = p_user_id;
  END IF;

  -- The recipient's manually assigned commitment buddy, if any, and only
  -- while the buddy is still a member of this cohort.
  SELECT assignment.buddy_user_id
  INTO v_buddy_id
  FROM public.commitment_buddy_assignments AS assignment
  JOIN public.cohort_members AS active_member
    ON active_member.cohort_id = assignment.cohort_id
   AND active_member.user_id = assignment.buddy_user_id
  WHERE assignment.cohort_id = p_cohort_id
    AND assignment.user_id = p_user_id;

  IF v_buddy_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(BTRIM(full_name), ''), 'Your buddy') INTO v_buddy_name
    FROM public.profiles WHERE id = v_buddy_id;

    SELECT id INTO v_buddy_plan_id
    FROM public.commitment_wallet_plans
    WHERE user_id = v_buddy_id AND cohort_id = p_cohort_id;

    IF v_buddy_plan_id IS NOT NULL THEN
      v_buddy_score := public.commitment_wallet_plan_score(v_buddy_plan_id);
    END IF;
  END IF;

  RETURN JSONB_BUILD_OBJECT(
    'hasFinalisedPlan', v_has_plan,
    'currentScore', v_current_score,
    'teamPoints', v_team_points,
    'teamMaximumPoints', v_team_maximum,
    'contributionRank', v_rank,
    'teamMemberCount', v_team_members,
    'buddyName', v_buddy_name,
    'buddyScore', v_buddy_score
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_commitment_wallet_email_summary(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_commitment_wallet_email_summary(UUID, UUID) TO service_role;

-- Superadmin user deletion (migration 055): purge manual buddy assignments
-- instead of the old group-membership/dissolve logic.
CREATE OR REPLACE FUNCTION public.purge_user_owned_data(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Manual buddy assignments, both as the assignee and as someone else's buddy.
  DELETE FROM public.commitment_buddy_assignments
  WHERE user_id = p_user_id OR buddy_user_id = p_user_id;

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

-- Drop the automatic pairing engine and its tables. Per product decision,
-- every existing auto-generated pair/trio is cleared — participants go back
-- to "waiting for a buddy" until a superadmin manually pairs them.
--
-- CASCADE is required here: commitment_buddy_groups' RLS policy ("Users read
-- own commitment buddy group") references commitment_buddy_members in its
-- USING clause, so plain DROP TABLE fails with "other objects depend on it".
-- Both tables (and everything hanging off them — that policy, their indexes,
-- FKs) are being removed together in this migration, so cascading is safe.
DROP FUNCTION IF EXISTS public.ensure_my_commitment_buddy_group(UUID);
DROP TABLE IF EXISTS public.commitment_buddy_members CASCADE;
DROP TABLE IF EXISTS public.commitment_buddy_groups CASCADE;
