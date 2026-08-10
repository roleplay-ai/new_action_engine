-- Fix: "Trainer read own cohort member profiles" (059) queries
-- public.cohort_members directly from a policy ON public.profiles.
-- cohort_members' own SELECT policy in turn joins public.profiles to check
-- admin/superadmin — profiles -> cohort_members -> profiles is a cycle, and
-- Postgres must evaluate every policy's USING clause to OR them together, so
-- this breaks EVERY read of profiles with "infinite recursion detected in
-- policy for relation profiles", not just trainer-initiated ones.
--
-- Same class of bug 008_profiles_policy_recursion_fix.sql already fixed for
-- the admin policies (SECURITY DEFINER functions read role/company_id
-- without going through profiles' own RLS). Apply the same fix here: wrap
-- the cohort_members lookup in a SECURITY DEFINER function so evaluating it
-- never re-enters cohort_members' RLS (which is what closes the loop).

CREATE OR REPLACE FUNCTION public.is_trainer_cohort_member(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cohort_members cm
    WHERE cm.user_id = target_user_id
      AND cm.cohort_id IN (SELECT public.current_trainer_cohort_ids())
  );
$$;

DROP POLICY IF EXISTS "Trainer read own cohort member profiles" ON public.profiles;
CREATE POLICY "Trainer read own cohort member profiles" ON public.profiles
  FOR SELECT USING (public.is_trainer_cohort_member(profiles.id));
