-- Stable, reciprocal commitment-buddy groups for each cohort.
--
-- Even-sized unassigned rosters are split into pairs. When the number of
-- unassigned participants is odd (and at least three), exactly one trio is
-- created and the rest remain pairs. Existing groups are never reshuffled;
-- late joiners wait until there are enough unassigned people to form a new
-- pair or trio.

CREATE TABLE IF NOT EXISTS public.commitment_buddy_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, cohort_id)
);

CREATE TABLE IF NOT EXISTS public.commitment_buddy_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL,
  cohort_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  revealed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT commitment_buddy_members_group_cohort_fkey
    FOREIGN KEY (group_id, cohort_id)
    REFERENCES public.commitment_buddy_groups(id, cohort_id)
    ON DELETE CASCADE,
  UNIQUE (cohort_id, user_id),
  UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_commitment_buddy_groups_cohort
  ON public.commitment_buddy_groups(cohort_id);
CREATE INDEX IF NOT EXISTS idx_commitment_buddy_members_group
  ON public.commitment_buddy_members(group_id);

ALTER TABLE public.commitment_buddy_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commitment_buddy_members ENABLE ROW LEVEL SECURITY;

-- Direct table access reveals only the caller's own membership and group.
-- Buddy names and totals are exposed solely through the narrow summary RPC
-- below; action titles, plan text, reflections, and schedules never leave
-- their owner's account.
DROP POLICY IF EXISTS "Users read own commitment buddy membership" ON public.commitment_buddy_members;
CREATE POLICY "Users read own commitment buddy membership" ON public.commitment_buddy_members
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own commitment buddy group" ON public.commitment_buddy_groups;
CREATE POLICY "Users read own commitment buddy group" ON public.commitment_buddy_groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.commitment_buddy_members AS membership
      WHERE membership.group_id = commitment_buddy_groups.id
        AND membership.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.ensure_my_commitment_buddy_group(p_cohort_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_unassigned UUID[];
  v_count INTEGER := 0;
  v_index INTEGER := 1;
  v_group_id UUID;
  v_my_group_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.cohort_members
    WHERE cohort_id = p_cohort_id
      AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You are not a member of this cohort';
  END IF;

  -- Buddy assignment starts only after the caller has activated this cohort's
  -- plan. Other roster members may still be paired before activating their own
  -- plans, but they do not see the reveal or summary until they activate.
  IF NOT EXISTS (
    SELECT 1
    FROM public.personal_action_subscriptions
    WHERE cohort_id = p_cohort_id
      AND user_id = v_user_id
      AND is_active = TRUE
      AND archived_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;

  -- Serialize grouping within a cohort so two simultaneous activations cannot
  -- assign the same participant twice or produce unstable group sizes.
  PERFORM pg_advisory_xact_lock(hashtext(p_cohort_id::TEXT));

  SELECT ARRAY_AGG(unassigned.user_id ORDER BY RANDOM())
  INTO v_unassigned
  FROM (
    SELECT member.user_id
    FROM public.cohort_members AS member
    WHERE member.cohort_id = p_cohort_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.commitment_buddy_members AS assigned
        WHERE assigned.cohort_id = p_cohort_id
          AND assigned.user_id = member.user_id
      )
  ) AS unassigned;

  v_count := COALESCE(ARRAY_LENGTH(v_unassigned, 1), 0);

  -- Odd rosters use one three-person reciprocal group.
  IF v_count >= 3 AND MOD(v_count, 2) = 1 THEN
    INSERT INTO public.commitment_buddy_groups (cohort_id)
    VALUES (p_cohort_id)
    RETURNING id INTO v_group_id;

    INSERT INTO public.commitment_buddy_members (group_id, cohort_id, user_id)
    VALUES
      (v_group_id, p_cohort_id, v_unassigned[1]),
      (v_group_id, p_cohort_id, v_unassigned[2]),
      (v_group_id, p_cohort_id, v_unassigned[3]);

    v_index := 4;
  END IF;

  WHILE v_index + 1 <= v_count LOOP
    INSERT INTO public.commitment_buddy_groups (cohort_id)
    VALUES (p_cohort_id)
    RETURNING id INTO v_group_id;

    INSERT INTO public.commitment_buddy_members (group_id, cohort_id, user_id)
    VALUES
      (v_group_id, p_cohort_id, v_unassigned[v_index]),
      (v_group_id, p_cohort_id, v_unassigned[v_index + 1]);

    v_index := v_index + 2;
  END LOOP;

  SELECT membership.group_id
  INTO v_my_group_id
  FROM public.commitment_buddy_members AS membership
  WHERE membership.cohort_id = p_cohort_id
    AND membership.user_id = v_user_id;

  RETURN v_my_group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_commitment_buddy_group(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_my_commitment_buddy_group(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_commitment_buddies(p_cohort_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_group_id UUID;
  v_revealed_at TIMESTAMPTZ;
  v_group_size INTEGER := 0;
  v_buddies JSONB := '[]'::JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_group_id := public.ensure_my_commitment_buddy_group(p_cohort_id);
  IF v_group_id IS NULL THEN
    RETURN JSONB_BUILD_OBJECT(
      'groupId', NULL,
      'groupSize', 0,
      'revealPending', FALSE,
      'buddies', '[]'::JSONB
    );
  END IF;

  SELECT membership.revealed_at
  INTO v_revealed_at
  FROM public.commitment_buddy_members AS membership
  WHERE membership.group_id = v_group_id
    AND membership.user_id = v_user_id;

  SELECT COUNT(*)::INTEGER
  INTO v_group_size
  FROM public.commitment_buddy_members AS membership
  JOIN public.cohort_members AS active_member
    ON active_member.cohort_id = membership.cohort_id
   AND active_member.user_id = membership.user_id
  WHERE membership.group_id = v_group_id;

  SELECT COALESCE(
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'id', profile.id,
        'name', COALESCE(NULLIF(BTRIM(profile.full_name), ''), 'Cohort member'),
        'done', (
          SELECT COUNT(*)::INTEGER
          FROM public.user_actions AS user_action
          WHERE user_action.user_id = profile.id
            AND user_action.cohort_id = p_cohort_id
            AND user_action.status = 'success'
        ),
        'skipped', (
          SELECT COUNT(*)::INTEGER
          FROM public.user_actions AS user_action
          WHERE user_action.user_id = profile.id
            AND user_action.cohort_id = p_cohort_id
            AND (
              user_action.status = 'skipped'
              OR (
                user_action.status = 'failed'
                AND LOWER(BTRIM(COALESCE(user_action.reflection, ''))) = 'skipped'
              )
            )
        ),
        'missed', (
          SELECT COUNT(*)::INTEGER
          FROM public.user_actions AS user_action
          WHERE user_action.user_id = profile.id
            AND user_action.cohort_id = p_cohort_id
            AND user_action.status = 'failed'
            AND LOWER(BTRIM(COALESCE(user_action.reflection, ''))) <> 'skipped'
        ),
        'pointsEarned', (
          SELECT COALESCE(SUM(GREATEST(point_event.points_delta, 0)), 0)::INTEGER
          FROM public.action_point_events AS point_event
          WHERE point_event.user_id = profile.id
            AND point_event.cohort_id = p_cohort_id
        ),
        'pointsLost', (
          SELECT COALESCE(ABS(SUM(LEAST(point_event.points_delta, 0))), 0)::INTEGER
          FROM public.action_point_events AS point_event
          WHERE point_event.user_id = profile.id
            AND point_event.cohort_id = p_cohort_id
        )
      )
      ORDER BY membership.created_at, profile.full_name, profile.id
    ),
    '[]'::JSONB
  )
  INTO v_buddies
  FROM public.commitment_buddy_members AS membership
  JOIN public.cohort_members AS active_member
    ON active_member.cohort_id = membership.cohort_id
   AND active_member.user_id = membership.user_id
  JOIN public.profiles AS profile
    ON profile.id = membership.user_id
  WHERE membership.group_id = v_group_id
    AND membership.user_id <> v_user_id;

  RETURN JSONB_BUILD_OBJECT(
    'groupId', v_group_id,
    'groupSize', v_group_size,
    'revealPending', v_revealed_at IS NULL AND JSONB_ARRAY_LENGTH(v_buddies) > 0,
    'buddies', v_buddies
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

  UPDATE public.commitment_buddy_members
  SET revealed_at = COALESCE(revealed_at, NOW())
  WHERE cohort_id = p_cohort_id
    AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.mark_my_commitment_buddy_revealed(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_my_commitment_buddy_revealed(UUID) TO authenticated;

-- Leaving a cohort removes only that participant from the group. Remaining
-- members stay together and are deliberately not reshuffled.
CREATE OR REPLACE FUNCTION public.remove_departed_commitment_buddy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id UUID;
BEGIN
  DELETE FROM public.commitment_buddy_members
  WHERE cohort_id = OLD.cohort_id
    AND user_id = OLD.user_id
  RETURNING group_id INTO v_group_id;

  IF v_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.commitment_buddy_members WHERE group_id = v_group_id
  ) THEN
    DELETE FROM public.commitment_buddy_groups WHERE id = v_group_id;
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_departed_commitment_buddy() FROM PUBLIC;

DROP TRIGGER IF EXISTS cohort_member_commitment_buddy_cleanup ON public.cohort_members;
CREATE TRIGGER cohort_member_commitment_buddy_cleanup
  AFTER DELETE ON public.cohort_members
  FOR EACH ROW
  EXECUTE FUNCTION public.remove_departed_commitment_buddy();

COMMENT ON TABLE public.commitment_buddy_groups IS
  'Stable reciprocal pairs, with one three-person group when an unassigned cohort roster is odd.';
COMMENT ON TABLE public.commitment_buddy_members IS
  'Cohort-scoped buddy membership plus the participant-specific reveal acknowledgement.';
