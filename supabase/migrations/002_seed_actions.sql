-- Seed: one company (Demo Company) + Action Library for that company (Phase 0)
-- From lib/constants.ts ACTION_DECK. Run after 001_base_schema.sql.

-- 1. Insert one company (id will be used for actions)
INSERT INTO public.companies (name, slug)
VALUES ('Demo Company', 'demo-company')
ON CONFLICT (slug) DO NOTHING;

-- 2. Seed actions for Demo Company (company_id from slug); skip if already present
INSERT INTO public.actions (company_id, theme, title, how, why, points, time_estimate, is_system_action)
SELECT c.id, a.theme, a.title, a.how, a.why, a.points, a.time_estimate, true
FROM public.companies c,
LATERAL (VALUES
  ('Accountability'::action_theme, 'End your next meeting by summarizing key takeaways and explicitly asking if anything was unclear', 'In the last 2 minutes, state: "Here is what I heard as our core decisions... does anyone have a different understanding or feels something is missing?"', 'Ambiguity is the enemy of action. Explicit summaries prevent misalignment and wasted effort.', 5, '5 mins'),
  ('Collaboration', 'Recognize and reward teams that achieve creative solutions or innovations through collaboration.', 'Send a quick shoutout in your shared channel specifically highlighting HOW two people or teams worked together to solve a complex problem.', 'What gets measured gets managed; what gets celebrated gets repeated.', 5, '2 mins'),
  ('Feedback', 'Ask for a "1% Improvement" Tip at the end of a project sync', 'Ask: "What is one thing we could do 1% better in our next sprint to make your life easier?"', 'Small continuous adjustments are more sustainable than large-scale overhauls.', 5, '3 mins'),
  ('Connection', 'Set time to connect with family or friends', 'Block 30 minutes in your personal calendar this week specifically for a call or visit with someone you haven''t spoken to in over a month.', 'Social health directly impacts professional cognitive endurance.', 5, '30 mins'),
  ('Coaching', 'Connect your team member with a mentor in your network', 'Identify one growth area for a direct report and introduce them via email to someone in your network who excels in that area.', 'Expanding a team''s network is the highest leverage coaching action a leader can take.', 5, '10 mins'),
  ('Collaboration', 'In your next project meeting, clearly define and document each team member''s roles and responsibilities.', 'Create a simple RACI matrix or bulleted list during the call and share it immediately after.', 'Role clarity reduces friction and prevents duplicated effort.', 5, '15 mins')
) AS a(theme, title, how, why, points, time_estimate)
WHERE c.slug = 'demo-company'
  AND NOT EXISTS (SELECT 1 FROM public.actions ac WHERE ac.company_id = c.id AND ac.title = a.title);
