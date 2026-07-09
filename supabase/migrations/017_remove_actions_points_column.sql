-- Remove points column from actions table
-- XP reward strength is no longer used in action creation

ALTER TABLE public.actions DROP COLUMN IF EXISTS points;
