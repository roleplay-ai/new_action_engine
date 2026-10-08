-- Surprise Boxes (docs/SURPRISE_BOXES_PLAN.md)
--
-- Superadmin curates a library of videos/resources, each with a description.
-- When a participant finalises their plan, a Gemini matcher maps each action
-- to one resource (actions.surprise_resource_id). Marking an action done — on
-- time, late, or validated from Pending validation — unlocks that action's
-- box, revealed in the Commitment Wallet.
--
-- Only plans finalised after this migration get boxes: existing plans are
-- pinned to surprise_boxes_enabled = FALSE and see a locked shelf.

-- ---------------------------------------------------------------------------
-- Storage: a dedicated bucket, separate from email-assets and the other
-- buckets. Public for durable display URLs; writes only via the service role
-- (same convention as 080_email_assets_bucket.sql).
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES (
  'surprise-box-resources',
  'surprise-box-resources',
  true,
  ARRAY[
    'video/mp4', 'video/webm', 'video/quicktime',
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp', 'image/gif'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Library
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.surprise_box_resources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  description TEXT NOT NULL CHECK (length(btrim(description)) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('video', 'resource')),
  source TEXT NOT NULL CHECK (source IN ('upload', 'link')),
  storage_path TEXT,
  external_url TEXT,
  thumbnail_path TEXT,
  duration_label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT surprise_box_resources_source_location CHECK (
    (source = 'upload' AND storage_path IS NOT NULL AND external_url IS NULL)
    OR (source = 'link' AND external_url IS NOT NULL AND storage_path IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_surprise_box_resources_active
  ON public.surprise_box_resources(is_active, created_at);

COMMENT ON TABLE public.surprise_box_resources IS
  'Superadmin-curated Surprise Box library (global, not company-scoped). description drives the Gemini action-to-resource matcher. Files live in the surprise-box-resources bucket (source = upload) or at external_url (source = link). Deactivate instead of deleting once mapped.';
COMMENT ON COLUMN public.surprise_box_resources.description IS
  'What the resource is about. Sent to the matcher to map plan actions to resources; also shown on the box card.';

ALTER TABLE public.surprise_box_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmin manage surprise box resources" ON public.surprise_box_resources;
CREATE POLICY "Superadmin manage surprise box resources" ON public.surprise_box_resources
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

-- ---------------------------------------------------------------------------
-- Mapping: written by the matcher, mirroring actions.image_url from the
-- action-image matcher (074_action_images.sql).
-- ---------------------------------------------------------------------------
ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS surprise_resource_id UUID
    REFERENCES public.surprise_box_resources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_actions_surprise_resource
  ON public.actions(surprise_resource_id)
  WHERE surprise_resource_id IS NOT NULL;

COMMENT ON COLUMN public.actions.surprise_resource_id IS
  'Surprise Box resource the matcher picked for this personal action. NULL until matched; unlock_my_surprise_box() falls back to the least-used active resource.';

-- ---------------------------------------------------------------------------
-- Gating: existing plans get FALSE (locked shelf, current celebration);
-- every plan finalised after this migration defaults to TRUE.
-- ---------------------------------------------------------------------------
ALTER TABLE public.commitment_wallet_plans
  ADD COLUMN IF NOT EXISTS surprise_boxes_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.commitment_wallet_plans
  ALTER COLUMN surprise_boxes_enabled SET DEFAULT TRUE;

COMMENT ON COLUMN public.commitment_wallet_plans.surprise_boxes_enabled IS
  'TRUE for plans finalised after Surprise Boxes launched (081). Plans that existed before stay FALSE: locked shelf, no unlocks.';

-- ---------------------------------------------------------------------------
-- Unlocks: one row per action whose box the participant has unlocked.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.surprise_box_unlocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.commitment_wallet_plans(id) ON DELETE CASCADE,
  action_id UUID NOT NULL UNIQUE REFERENCES public.actions(id) ON DELETE CASCADE,
  -- Snapshot at unlock time so re-mapping never changes an unlocked box.
  -- NULL only if the library had no active resources at unlock time.
  resource_id UUID REFERENCES public.surprise_box_resources(id) ON DELETE SET NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_surprise_box_unlocks_user_plan
  ON public.surprise_box_unlocks(user_id, plan_id);
CREATE INDEX IF NOT EXISTS idx_surprise_box_unlocks_plan_resource
  ON public.surprise_box_unlocks(plan_id, resource_id);

COMMENT ON TABLE public.surprise_box_unlocks IS
  'Surprise Boxes a participant has unlocked, one per completed action. Written only by unlock_my_surprise_box(); opened_at set by mark_my_surprise_box_opened().';

ALTER TABLE public.surprise_box_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own surprise box unlocks" ON public.surprise_box_unlocks;
CREATE POLICY "Users read own surprise box unlocks" ON public.surprise_box_unlocks
  FOR SELECT USING (auth.uid() = user_id);

-- Participants see active resources, plus any resource already in one of their
-- unlocked boxes (so deactivating a resource never empties an opened box).
DROP POLICY IF EXISTS "Users read active surprise box resources" ON public.surprise_box_resources;
DROP POLICY IF EXISTS "Users read active or unlocked surprise box resources" ON public.surprise_box_resources;
CREATE POLICY "Users read active or unlocked surprise box resources" ON public.surprise_box_resources
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      is_active = TRUE
      OR EXISTS (
        SELECT 1 FROM public.surprise_box_unlocks unlocked
        WHERE unlocked.resource_id = surprise_box_resources.id
          AND unlocked.user_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Unlock the caller's box for a completed action. Idempotent: returns the
-- existing unlock when called again for the same action (double clicks,
-- reused email links, the Friday "I completed all" loop). Returns no row when
-- the action isn't the caller's wallet action, isn't completed, or its plan
-- doesn't have boxes enabled.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unlock_my_surprise_box(p_action_id UUID)
RETURNS SETOF public.surprise_box_unlocks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_wallet_action public.commitment_wallet_actions%ROWTYPE;
  v_plan public.commitment_wallet_plans%ROWTYPE;
  v_resource_id UUID;
  v_unlock public.surprise_box_unlocks%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_wallet_action
  FROM public.commitment_wallet_actions
  WHERE action_id = p_action_id
    AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Serialise unlocks per plan so concurrent completions read a consistent
  -- usage count for the fallback below.
  SELECT * INTO v_plan
  FROM public.commitment_wallet_plans
  WHERE id = v_wallet_action.plan_id
  FOR UPDATE;
  IF NOT FOUND OR NOT v_plan.surprise_boxes_enabled THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.surprise_box_unlocks WHERE action_id = p_action_id) THEN
    RETURN QUERY SELECT * FROM public.surprise_box_unlocks WHERE action_id = p_action_id;
    RETURN;
  END IF;

  -- On time, late, and validated completions all end in 'success'.
  IF NOT EXISTS (
    SELECT 1 FROM public.user_actions
    WHERE user_id = v_user_id
      AND action_id = p_action_id
      AND status = 'success'
  ) THEN
    RETURN;
  END IF;

  SELECT resource.id INTO v_resource_id
  FROM public.actions plan_action
  JOIN public.surprise_box_resources resource
    ON resource.id = plan_action.surprise_resource_id
   AND resource.is_active
  WHERE plan_action.id = p_action_id;

  -- Matcher hasn't run, failed, or its pick was deactivated: use the active
  -- resource this plan has unlocked least, oldest first, so a box is never empty.
  IF v_resource_id IS NULL THEN
    SELECT resource.id INTO v_resource_id
    FROM public.surprise_box_resources resource
    LEFT JOIN public.surprise_box_unlocks used
      ON used.resource_id = resource.id
     AND used.plan_id = v_plan.id
    WHERE resource.is_active
    GROUP BY resource.id, resource.created_at
    ORDER BY COUNT(used.id), resource.created_at, resource.id
    LIMIT 1;
  END IF;

  INSERT INTO public.surprise_box_unlocks (user_id, cohort_id, plan_id, action_id, resource_id)
  VALUES (v_user_id, v_plan.cohort_id, v_plan.id, p_action_id, v_resource_id)
  RETURNING * INTO v_unlock;
  RETURN NEXT v_unlock;
END;
$$;

COMMENT ON FUNCTION public.unlock_my_surprise_box(UUID) IS
  'Unlocks the caller''s Surprise Box for a completed (status success) wallet action in a plan with surprise_boxes_enabled. Idempotent per action. Uses actions.surprise_resource_id, else the least-used active resource.';

REVOKE ALL ON FUNCTION public.unlock_my_surprise_box(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_my_surprise_box(UUID) TO authenticated;

-- Marks one of the caller's boxes as opened (first open wins).
CREATE OR REPLACE FUNCTION public.mark_my_surprise_box_opened(p_unlock_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opened_at TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.surprise_box_unlocks
  SET opened_at = COALESCE(opened_at, NOW())
  WHERE id = p_unlock_id
    AND user_id = auth.uid()
  RETURNING opened_at INTO v_opened_at;

  RETURN v_opened_at;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_my_surprise_box_opened(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_my_surprise_box_opened(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Superadmin user deletion: also purge Surprise Box unlocks. Body copied from
-- 070_manual_commitment_buddy_pairing.sql with the one added DELETE.
-- ---------------------------------------------------------------------------
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
  DELETE FROM public.surprise_box_unlocks WHERE user_id = p_user_id;
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
