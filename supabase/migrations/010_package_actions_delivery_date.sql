-- Add per-action (per-week) delivery dates for packages
-- This lets admins control exactly when each week's delivery goes live.

ALTER TABLE public.package_actions
ADD COLUMN IF NOT EXISTS delivery_date DATE;

