-- Scope every participant action plan to a cohort. A participant may retain
-- several cohort memberships for history, while current_cohort_id identifies
-- the cohort they are actively progressing through and selected_cohort_id is
-- the cohort they are currently viewing in the participant UI.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_cohort_id UUID REFERENCES public.cohorts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selected_cohort_id UUID REFERENCES public.cohorts(id) ON DELETE SET NULL;

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS cohort_id UUID REFERENCES public.cohorts(id) ON DELETE SET NULL;

ALTER TABLE public.user_actions
  ADD COLUMN IF NOT EXISTS cohort_id UUID REFERENCES public.cohorts(id) ON DELETE SET NULL;

ALTER TABLE public.feed_events
  ADD COLUMN IF NOT EXISTS cohort_id UUID REFERENCES public.cohorts(id) ON DELETE SET NULL;

ALTER TABLE public.personal_action_subscriptions
  ADD COLUMN IF NOT EXISTS cohort_id UUID REFERENCES public.cohorts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE public.personal_action_generation_jobs
  ADD COLUMN IF NOT EXISTS cohort_id UUID REFERENCES public.cohorts(id) ON DELETE SET NULL;

ALTER TABLE public.personal_action_backlog
  ADD COLUMN IF NOT EXISTS cohort_id UUID REFERENCES public.cohorts(id) ON DELETE SET NULL;

-- The most recently assigned membership becomes the current cohort for legacy
-- users. Both fields are populated together only when they have no valid value.
WITH latest_membership AS (
  SELECT DISTINCT ON (user_id) user_id, cohort_id
  FROM public.cohort_members
  ORDER BY user_id, created_at DESC
)
UPDATE public.profiles AS profile
SET
  current_cohort_id = COALESCE(profile.current_cohort_id, latest_membership.cohort_id),
  selected_cohort_id = COALESCE(profile.selected_cohort_id, profile.current_cohort_id, latest_membership.cohort_id)
FROM latest_membership
WHERE profile.id = latest_membership.user_id;

-- Best-effort attribution for data created before cohort scoping existed.
UPDATE public.personal_action_subscriptions AS subscription
SET cohort_id = COALESCE(
  (
    SELECT membership.cohort_id
    FROM public.cohort_members AS membership
    WHERE membership.user_id = subscription.user_id
      AND membership.created_at <= subscription.created_at
    ORDER BY membership.created_at DESC
    LIMIT 1
  ),
  profile.current_cohort_id
)
FROM public.profiles AS profile
WHERE subscription.user_id = profile.id
  AND subscription.cohort_id IS NULL;

UPDATE public.personal_action_generation_jobs AS job
SET cohort_id = COALESCE(
  (
    SELECT membership.cohort_id
    FROM public.cohort_members AS membership
    WHERE membership.user_id = job.user_id
      AND membership.created_at <= job.created_at
    ORDER BY membership.created_at DESC
    LIMIT 1
  ),
  profile.current_cohort_id
)
FROM public.profiles AS profile
WHERE job.user_id = profile.id
  AND job.cohort_id IS NULL;

UPDATE public.personal_action_backlog AS backlog
SET cohort_id = COALESCE(
  (
    SELECT membership.cohort_id
    FROM public.cohort_members AS membership
    WHERE membership.user_id = backlog.user_id
      AND membership.created_at <= backlog.created_at
    ORDER BY membership.created_at DESC
    LIMIT 1
  ),
  profile.current_cohort_id
)
FROM public.profiles AS profile
WHERE backlog.user_id = profile.id
  AND backlog.cohort_id IS NULL;

UPDATE public.actions AS action
SET cohort_id = COALESCE(
  (
    SELECT membership.cohort_id
    FROM public.cohort_members AS membership
    WHERE membership.user_id = action.created_by
      AND membership.created_at <= action.created_at
    ORDER BY membership.created_at DESC
    LIMIT 1
  ),
  profile.current_cohort_id
)
FROM public.profiles AS profile
WHERE action.created_by = profile.id
  AND action.is_personal = TRUE
  AND action.cohort_id IS NULL;

UPDATE public.user_actions AS user_action
SET cohort_id = action.cohort_id
FROM public.actions AS action
WHERE user_action.action_id = action.id
  AND user_action.cohort_id IS NULL;

UPDATE public.personal_action_subscriptions AS subscription
SET is_active = FALSE,
    archived_at = COALESCE(subscription.archived_at, NOW()),
    updated_at = NOW()
FROM public.profiles AS profile
WHERE subscription.user_id = profile.id
  AND subscription.cohort_id IS DISTINCT FROM profile.current_cohort_id
  AND subscription.archived_at IS NULL;

UPDATE public.personal_action_generation_jobs AS job
SET status = 'failed',
    error_message = 'Archived when participant moved to another cohort',
    updated_at = NOW()
FROM public.profiles AS profile
WHERE job.user_id = profile.id
  AND job.cohort_id IS DISTINCT FROM profile.current_cohort_id
  AND job.status = 'generating';

ALTER TABLE public.personal_action_subscriptions
  DROP CONSTRAINT IF EXISTS personal_action_subscriptions_user_id_key;

ALTER TABLE public.personal_action_subscriptions
  DROP CONSTRAINT IF EXISTS personal_action_subscriptions_user_cohort_key;

ALTER TABLE public.personal_action_subscriptions
  ADD CONSTRAINT personal_action_subscriptions_user_cohort_key UNIQUE (user_id, cohort_id);

CREATE INDEX IF NOT EXISTS idx_profiles_current_cohort
  ON public.profiles(current_cohort_id);
CREATE INDEX IF NOT EXISTS idx_actions_cohort_created_by
  ON public.actions(cohort_id, created_by);
CREATE INDEX IF NOT EXISTS idx_user_actions_cohort_user
  ON public.user_actions(cohort_id, user_id);
CREATE INDEX IF NOT EXISTS idx_feed_events_cohort_created
  ON public.feed_events(cohort_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_personal_action_subscriptions_cohort
  ON public.personal_action_subscriptions(cohort_id, user_id);
CREATE INDEX IF NOT EXISTS idx_personal_action_generation_jobs_cohort
  ON public.personal_action_generation_jobs(cohort_id, user_id, created_at DESC);

COMMENT ON COLUMN public.profiles.current_cohort_id IS
  'The participant''s active learning cycle. Adding them to a new cohort moves this pointer and archives earlier active plans.';
COMMENT ON COLUMN public.profiles.selected_cohort_id IS
  'The cohort currently being viewed in the participant UI; may point to an earlier retained membership.';
COMMENT ON COLUMN public.personal_action_subscriptions.archived_at IS
  'Set when a newer cohort becomes current. Archived plans do not deliver reminders, but their existing actions remain available when revisited.';

-- A newly assigned cohort becomes current automatically. Previous cohort plans
-- stop sending reminders but remain queryable and actionable as history.
CREATE OR REPLACE FUNCTION public.set_current_cohort_on_membership()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET current_cohort_id = NEW.cohort_id,
      selected_cohort_id = NEW.cohort_id
  WHERE id = NEW.user_id;

  UPDATE public.personal_action_subscriptions
  SET is_active = FALSE,
      archived_at = COALESCE(archived_at, NOW()),
      updated_at = NOW()
  WHERE user_id = NEW.user_id
    AND cohort_id IS DISTINCT FROM NEW.cohort_id
    AND archived_at IS NULL;

  UPDATE public.personal_action_generation_jobs
  SET status = 'failed',
      error_message = 'Archived when participant moved to another cohort',
      updated_at = NOW()
  WHERE user_id = NEW.user_id
    AND cohort_id IS DISTINCT FROM NEW.cohort_id
    AND status = 'generating';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_cohort_membership_sets_current ON public.cohort_members;
CREATE TRIGGER on_cohort_membership_sets_current
  AFTER INSERT OR UPDATE ON public.cohort_members
  FOR EACH ROW EXECUTE FUNCTION public.set_current_cohort_on_membership();

-- If the current membership is removed, fall back to the latest retained
-- membership. Archived plans stay archived; removal never silently restarts one.
CREATE OR REPLACE FUNCTION public.fallback_cohort_after_membership_delete()
RETURNS TRIGGER AS $$
DECLARE
  fallback_id UUID;
BEGIN
  SELECT cohort_id INTO fallback_id
  FROM public.cohort_members
  WHERE user_id = OLD.user_id
  ORDER BY created_at DESC
  LIMIT 1;

  UPDATE public.profiles
  SET current_cohort_id = CASE WHEN current_cohort_id = OLD.cohort_id THEN fallback_id ELSE current_cohort_id END,
      selected_cohort_id = CASE WHEN selected_cohort_id = OLD.cohort_id THEN fallback_id ELSE selected_cohort_id END
  WHERE id = OLD.user_id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_cohort_membership_delete_fallback ON public.cohort_members;
CREATE TRIGGER on_cohort_membership_delete_fallback
  AFTER DELETE ON public.cohort_members
  FOR EACH ROW EXECUTE FUNCTION public.fallback_cohort_after_membership_delete();
