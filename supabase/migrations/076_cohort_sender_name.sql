-- Per-batch email sender display name — lets an admin/superadmin override
-- who a batch's emails (reminders, recaps, notices, etc.) appear to come
-- from, independent of any assigned trainer. Blank falls back to the
-- trainer's name (existing behaviour) and finally to "Nudgeable" — see
-- lib/email-send.ts and app/actions/user-actions.ts.

ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS sender_name TEXT;

COMMENT ON COLUMN public.cohorts.sender_name IS
  'Optional display name shown as the email "From" for this batch''s communications. Falls back to the assigned trainer''s name, then "Nudgeable", when unset.';
