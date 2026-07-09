-- Remove the skill_theme column from packages; package name is the only identity field now.
ALTER TABLE public.packages DROP COLUMN IF EXISTS skill_theme;
