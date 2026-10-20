-- Per-batch subject overrides for participant emails, edited by a superadmin
-- in the batch's Settings tab. Shape: { "daily_reminder": "...",
-- "weekly_recap": "..." }. A missing or blank key keeps the default subject —
-- see lib/batch-email-subjects.ts and lib/email-send.ts.

ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS email_subjects JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.cohorts.email_subjects IS
  'Optional per-email subject overrides for this batch (keys: daily_reminder, weekly_recap). Supports {{placeholders}}. Missing keys use the default subject.';
