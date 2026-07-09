-- Remove unused columns from packages table
-- These fields are no longer used in the UI:
-- - actions_per_week (frequency)
-- - rule_of_five (deployment enrollment setting)
-- - points_weight (deployment enrollment setting)

ALTER TABLE public.packages DROP COLUMN IF EXISTS actions_per_week;
ALTER TABLE public.packages DROP COLUMN IF EXISTS rule_of_five;
ALTER TABLE public.packages DROP COLUMN IF EXISTS points_weight;
