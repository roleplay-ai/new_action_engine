-- Cohort lock: a superadmin can lock a cohort so its participants lose
-- access to My Plan, action creation, and the Commitment Wallet until it's
-- unlocked. New cohorts start locked by default.
--
-- Existing cohorts predate this feature and are presumably already in
-- active use — retroactively locking them would cut off their current
-- participants, so they're explicitly unlocked below right after the
-- column (with its "locked by default" DEFAULT true) is added.

ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.cohorts.locked IS
  'When true, participants in this cohort cannot access My Plan, create actions, or view the Commitment Wallet — they see a countdown to the cohort''s next date instead. Toggled by a superadmin only (app/actions/cohorts.ts:setCohortLock). New cohorts default to locked; this UPDATE keeps pre-existing cohorts unlocked so this migration does not lock out already-active participants.';

UPDATE public.cohorts SET locked = false;
