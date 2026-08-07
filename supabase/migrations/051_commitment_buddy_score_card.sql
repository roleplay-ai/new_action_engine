-- Commitment buddy score card
--
-- The buddy card now compares a participant's live Commitment Score against
-- their score as of the *previous period* — yesterday for a daily-track
-- plan, last week for a weekly-track plan. The live score is already
-- computed on demand (see get_my_commitment_wallet), but "yesterday's score"
-- or "last week's score" only exists if it was recorded at the time, so this
-- adds a daily snapshot history and a helper to read it back per track.

CREATE TABLE IF NOT EXISTS public.commitment_wallet_score_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  score NUMERIC(5,1) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, cohort_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_commitment_wallet_score_snapshots_lookup
  ON public.commitment_wallet_score_snapshots(user_id, cohort_id, snapshot_date);

ALTER TABLE public.commitment_wallet_score_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own commitment wallet score snapshots" ON public.commitment_wallet_score_snapshots;
CREATE POLICY "Users read own commitment wallet score snapshots" ON public.commitment_wallet_score_snapshots
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.commitment_wallet_score_snapshots IS
  'One row per user per cohort per IST calendar day: that day''s end-of-day Commitment Score. Populated by the daily cron via snapshot_commitment_wallet_scores(). A buddy''s previous-period score is read from here, never computed live for a past date.';

-- Shared scoring formula so the live RPC and the daily snapshot never drift
-- apart. Mirrors the inline calculation in get_my_commitment_wallet.
CREATE OR REPLACE FUNCTION public.commitment_wallet_plan_score(p_plan_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN plan.planned_actions > 0 THEN
    ROUND(
      (
        GREATEST(
          0,
          plan.planned_actions - (
            SELECT COUNT(*)::INTEGER
            FROM public.commitment_wallet_events AS event
            WHERE event.plan_id = plan.id
              AND event.event_type IN ('missed', 'completed_late')
          )
        ) * 100.0 / plan.planned_actions
      )::NUMERIC,
      1
    )
  ELSE 0 END
  FROM public.commitment_wallet_plans AS plan
  WHERE plan.id = p_plan_id;
$$;

REVOKE ALL ON FUNCTION public.commitment_wallet_plan_score(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commitment_wallet_plan_score(UUID) TO authenticated, service_role;

-- Cron-only: records yesterday's end-of-day score for every finalised Wallet
-- plan. Call this right after expire_overdue_commitment_wallet_actions() (so
-- yesterday's actions are already settled) and before releasing today's
-- batch. Safe to re-run for the same day: the score is overwritten, not
-- duplicated.
CREATE OR REPLACE FUNCTION public.snapshot_commitment_wallet_scores()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_date DATE := ((NOW() AT TIME ZONE 'Asia/Kolkata')::DATE - 1);
  v_count INTEGER := 0;
BEGIN
  INSERT INTO public.commitment_wallet_score_snapshots (user_id, cohort_id, snapshot_date, score)
  SELECT
    plan.user_id,
    plan.cohort_id,
    v_snapshot_date,
    public.commitment_wallet_plan_score(plan.id)
  FROM public.commitment_wallet_plans AS plan
  ON CONFLICT (user_id, cohort_id, snapshot_date) DO UPDATE
    SET score = EXCLUDED.score;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_commitment_wallet_scores() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.snapshot_commitment_wallet_scores() TO service_role;

-- Buddy card data: replaces the old done/skipped/missed/points breakdown
-- (which read the legacy pre-Wallet points system) with each buddy's email,
-- delivery track, live score, and previous-period score so the UI can render
-- the "last period vs this period" comparison card.
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
  LEFT JOIN public.personal_action_subscriptions AS sub
    ON sub.cohort_id = p_cohort_id AND sub.user_id = profile.id
  LEFT JOIN public.commitment_wallet_plans AS wallet_plan
    ON wallet_plan.cohort_id = p_cohort_id AND wallet_plan.user_id = profile.id
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
