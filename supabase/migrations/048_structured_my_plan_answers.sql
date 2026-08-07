-- Store each participant-entered My Plan answer separately. Question titles,
-- helper hints, placeholders, and other UI copy are never persisted here.

ALTER TABLE public.participant_session_notes
  ADD COLUMN IF NOT EXISTS participant_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS designation TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS team TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS daily_work TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS skill_goal TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS practice_opportunities TEXT NOT NULL DEFAULT '';

-- Preserve notes written before the structured form existed. The old note is
-- placed in the broadest matching answer so the participant can reorganise it.
UPDATE public.participant_session_notes
SET skill_goal = body
WHERE BTRIM(body) <> ''
  AND BTRIM(participant_name) = ''
  AND BTRIM(designation) = ''
  AND BTRIM(team) = ''
  AND BTRIM(daily_work) = ''
  AND BTRIM(skill_goal) = ''
  AND BTRIM(practice_opportunities) = '';

COMMENT ON COLUMN public.participant_session_notes.daily_work IS
  'Participant answer describing their everyday work; excludes the UI question and helper hint.';
COMMENT ON COLUMN public.participant_session_notes.skill_goal IS
  'Participant answer describing the skill they want to build and why; excludes the UI question and helper hint.';
COMMENT ON COLUMN public.participant_session_notes.practice_opportunities IS
  'Participant answer describing regular opportunities to practise; excludes the UI question and helper hint.';
