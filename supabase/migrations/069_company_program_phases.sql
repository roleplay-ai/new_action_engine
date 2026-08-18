-- Program agenda (phases -> days -> session blocks) seeded per company by a
-- superadmin, typically at company creation. Powers the generic Journey
-- workspace's agenda section for every company other than Surge/RCPL
-- University (those keep their bespoke hardcoded RcplWorkspace agenda).
-- Shape (validated app-side, not by a DB constraint, so it can evolve freely):
-- [
--   {
--     "id": "1", "label": "Phase 1", "window": "Month 1 · 12 to 13 Jan",
--     "title": "Module 1 · ...", "subtitle": "", "focus": "...", "summary": "...",
--     "days": [
--       { "name": "Day 1 · ...", "date": "Mon 12 Jan", "takeaway": "...",
--         "blocks": [ { "time": "9.30-11.00", "name": "...", "description": "..." } ] }
--     ]
--   }
-- ]
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS program_phases JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.companies.program_phases IS
  'Optional seeded program agenda (phases/days/session blocks) shown on the generic Journey workspace for this company''s cohorts. Empty array hides the agenda section.';
