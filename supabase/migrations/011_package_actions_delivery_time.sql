-- Add per-action (per-delivery) time of day for packages
-- This lets each delivery within a package have its own delivery_time.

ALTER TABLE public.package_actions
ADD COLUMN IF NOT EXISTS delivery_time TIME;

