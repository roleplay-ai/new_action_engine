-- Moves the program agenda (phases -> days -> session blocks) from the
-- company level down to the batch (cohort) level, and adds a "current phase"
-- field so each batch can mark where it is in its own agenda — the journey
-- page defaults to that phase instead of always phase 1.
--
-- Batches within the same company can run on different schedules (a Jan
-- intake and a Mar intake of the same program are not on the same phase at
-- the same time), so the agenda belongs on cohorts, not companies. This also
-- folds in Surge/RCPL University's previously hardcoded SURGE curriculum
-- (components/journey/RcplWorkspace.tsx's old RCPL_PHASES constant), which is
-- now just seeded data like every other company's agenda.
--
-- Shape (validated app-side, not by a DB constraint, so it can evolve freely
-- — see parseProgramPhasesJson in app/actions/cohorts.ts):
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

ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS program_phases JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS current_phase_id TEXT;

COMMENT ON COLUMN public.cohorts.program_phases IS
  'Seeded program agenda (phases/days/session blocks) shown on this batch''s Journey/Home page. Empty array hides the agenda section.';
COMMENT ON COLUMN public.cohorts.current_phase_id IS
  'The id (ProgramPhase.id) of the phase this batch is currently in. Drives the phase shown by default on the Journey/Home page when no ?phase= query param is present. Null falls back to the first phase.';

-- Carry forward any company-level agenda that was set under the old scheme
-- (migration 069) so it isn't silently lost — copied onto every batch of
-- that company that doesn't already have its own agenda.
UPDATE public.cohorts
SET program_phases = companies.program_phases
FROM public.companies
WHERE cohorts.company_id = companies.id
  AND companies.program_phases IS NOT NULL
  AND companies.program_phases <> '[]'::jsonb
  AND cohorts.program_phases = '[]'::jsonb;

ALTER TABLE public.companies DROP COLUMN IF EXISTS program_phases;

-- Seed Surge's own batches with its previously hardcoded SURGE curriculum,
-- so the agenda they already see keeps rendering unchanged now that it comes
-- from this column instead of a constant in RcplWorkspace.tsx.
UPDATE public.cohorts
SET program_phases = $json$[
  {
    "id": "1",
    "label": "Phase 1",
    "window": "Month 1 · 20 to 21 Aug",
    "title": "Module 1 · Leading Business & Leading Future",
    "subtitle": "",
    "focus": "Leading Business & Leading Future",
    "summary": "Build strategic perspective, business acumen, and confidence for the future. Followed by two days of application and teachbacks.",
    "days": [
      {
        "name": "Day 1 · Leading Future",
        "date": "Thu 20 Aug",
        "takeaway": "Leave with a clear view of where the business is heading and one AI workflow you can run in your own week.",
        "blocks": [
          { "time": "9.30–10.00", "name": "Program Overview", "description": "How SURGE runs, what is expected between phases, and how this workspace fits in." },
          { "time": "10.00–11.30", "name": "RCPL Strategy & Future Outlook", "description": "Where the business is placing its bets and what that means for your function." },
          { "time": "11.45–4.30", "name": "AI in Workplace", "description": "A working session, lunch included. Build and test something on your own work." },
          { "time": "4.45–6.00", "name": "Leadership Fireside Chat", "description": "Open conversation with a senior leader. Bring questions." },
          { "time": "7.00–8.30", "name": "Welcome Dinner", "description": "Meet the people you will work with over the next six months." }
        ]
      },
      {
        "name": "Day 2 · Business Acumen",
        "date": "Fri 21 Aug",
        "takeaway": "Run a business for three years in a day and see where your decisions create or cost value.",
        "blocks": [
          { "time": "9.30–11.15", "name": "Foundation & Introduction to Simulation", "description": "The commercial levers you will pull and the rules of the simulation." },
          { "time": "11.30–1.15", "name": "Play Year 1 and Debrief", "description": "Make the first decisions, review the results, and identify what you missed." },
          { "time": "2.00–3.30", "name": "Play Year 2 and Debrief", "description": "Adjust your strategy with what you learned and run it again." },
          { "time": "3.45–6.00", "name": "Play Year 3, Debrief + Final Winners", "description": "Run the last round, review the results, and connect the learning to your P&L." }
        ]
      }
    ]
  },
  {
    "id": "2",
    "label": "Phase 2",
    "window": "Month 3 · 20 to 21 Oct",
    "title": "Module 2 · Leading Self",
    "subtitle": "",
    "focus": "Leading Self",
    "summary": "Work on the internal drivers: awareness, regulation, curiosity, and resilience. Followed by two months of application and teachbacks.",
    "days": [
      {
        "name": "Day 3 · Curiosity & Agile Thinking",
        "date": "Mon 20 Oct",
        "takeaway": "Leave with three tools for opening up a problem before you rush to solve it.",
        "blocks": [
          { "time": "9.30–11.00", "name": "Developing Curiosity & Agile Thinking", "description": "Why experienced leaders stop asking questions, and how to rebuild the habit." },
          { "time": "11.15–1.00", "name": "Creative Problem Solving through Six Thinking Hats", "description": "A structured method for arguing well without making it personal." },
          { "time": "1.45–4.30", "name": "Biomimicry for Innovation", "description": "Borrow solutions from nature and apply them to retail problems." },
          { "time": "4.45–6.00", "name": "Leadership Fireside Chat", "description": "Open conversation with a senior leader." }
        ]
      },
      {
        "name": "Day 4 · Emotional Intelligence",
        "date": "Tue 21 Oct",
        "takeaway": "Get language for what happens under pressure and a practical way to steady yourself in the moment.",
        "blocks": [
          { "time": "9.30–11.00", "name": "Developing Self Awareness", "description": "See what your default reactions cost through feedback and your own data." },
          { "time": "11.15–1.00", "name": "Emotional Regulation", "description": "Practical ways to hold your response when the stakes and noise are high." },
          { "time": "1.45–3.30", "name": "Leading with Empathy", "description": "Read the room and respond to what people are actually saying." },
          { "time": "3.45–6.00", "name": "Building Resilience Under Pressure", "description": "Recover quickly and keep your team steady while you do it." }
        ]
      }
    ]
  },
  {
    "id": "3",
    "label": "Phase 3",
    "window": "Month 5 · 15 to 16 Dec",
    "title": "Module 3 · Leading Others",
    "subtitle": "",
    "focus": "Leading Others",
    "summary": "Build interpersonal excellence through influence, stakeholder work, and cross-functional collaboration.",
    "days": [
      {
        "name": "Day 5 · Influencing without Authority",
        "date": "Mon 15 Dec",
        "takeaway": "Leave with a stakeholder map for one real situation and a plan for the person blocking it.",
        "blocks": [
          { "time": "9.30–11.00", "name": "Building Trust and Credibility", "description": "What earns you a hearing with people who do not report to you." },
          { "time": "11.15–1.00", "name": "Sources of Influence", "description": "The levers available beyond your title, and when each one works." },
          { "time": "1.45–3.15", "name": "Stakeholder Management", "description": "Map a live situation and plan the conversations that will move it." },
          { "time": "3.30–4.30", "name": "Managing Resistance", "description": "Work with the person who says no, instead of around them." },
          { "time": "4.45–6.00", "name": "Fireside Chat", "description": "Open conversation with a senior leader." }
        ]
      },
      {
        "name": "Day 6 · Cross Functional Collaboration",
        "date": "Tue 16 Dec",
        "takeaway": "End with a shared commitment across functions and your SURGE graduation.",
        "blocks": [
          { "time": "9.30–11.00", "name": "Collaborative Mindset", "description": "What gets in the way when two functions both think they are right." },
          { "time": "11.15–1.00", "name": "Breaking Silos", "description": "Where handoffs break in this business and what you can fix from your seat." },
          { "time": "1.45–3.30", "name": "Managing Interdependencies", "description": "Run work that depends on teams you do not control." },
          { "time": "3.45–5.15", "name": "Creating One Team Culture", "description": "Agree the behaviours this batch will hold each other to." },
          { "time": "5.30–6.00", "name": "SURGE Graduation", "description": "Close, recognition, and your action-point totals." }
        ]
      }
    ]
  }
]$json$::jsonb,
    current_phase_id = '1'
FROM public.companies
WHERE cohorts.company_id = companies.id
  AND companies.name ILIKE 'surge'
  AND cohorts.program_phases = '[]'::jsonb;
