// Seeds 30 dummy Surprise Box resources (supabase/migrations/081_surprise_boxes.sql)
// so the matcher, unlocks and wallet reveal can be tested end to end. Every
// title starts with "[Test] " and every resource is an external search link,
// so nothing is uploaded to the surprise-box-resources bucket.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
//     node scripts/seed-surprise-resources.mjs            # add (skips titles that already exist)
//     node scripts/seed-surprise-resources.mjs --remove   # delete them (deactivates any already matched/unlocked)

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PREFIX = "[Test] ";
const youtube = (query) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
const search = (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`;

/** [kind, title, description, length label, search query] */
const RESOURCES = [
  ["video", "Giving feedback that sticks", "How to give specific, behaviour-based feedback to a teammate so it lands and leads to change, with a simple situation-behaviour-impact structure.", "5 min", "situation behaviour impact feedback model"],
  ["resource", "Feedback conversation planner", "A one-page worksheet to prepare a constructive feedback conversation: what you observed, its impact, and the change you're asking for.", "Worksheet", "feedback conversation planning worksheet"],
  ["video", "Praise that motivates", "Why specific, timely recognition motivates more than generic praise, and how to recognise a colleague's effort in one or two sentences.", "4 min", "how to give specific praise at work"],
  ["video", "Listening to understand, not to reply", "Practical active-listening habits — paraphrasing, pausing and asking follow-ups — that make colleagues feel genuinely heard in meetings and 1:1s.", "6 min", "active listening skills at work"],
  ["resource", "Open-question cheat sheet", "Twenty open questions that get people talking in stand-ups, 1:1s and team meetings, grouped by purpose: exploring, clarifying and deciding.", "PDF · 2 pages", "open ended questions for one on one meetings"],
  ["video", "Coaching instead of telling", "How to help a team member solve a problem themselves by asking coaching questions rather than handing over the answer.", "7 min", "coaching questions for managers GROW model"],
  ["resource", "GROW coaching model guide", "A short guide to the GROW model (Goal, Reality, Options, Will) with example questions for coaching conversations at work.", "Guide", "GROW coaching model guide"],
  ["video", "Delegating without dumping", "How to decide what to delegate, brief the task clearly and agree check-ins so the work comes back done well.", "6 min", "how to delegate effectively"],
  ["resource", "Delegation decision checklist", "A checklist for deciding which tasks to hand off, to whom, and how much authority to give with each one.", "Checklist", "delegation checklist for managers"],
  ["video", "Running a 10-minute weekly review", "A simple end-of-week ritual for looking at what worked, what didn't and what to change in your plan for next week.", "5 min", "weekly review habit"],
  ["video", "The 2-minute rule for starting anything", "Why starting with a tiny first step beats waiting for motivation, and how to apply it to the next action on your plan.", "4 min", "2 minute rule habits"],
  ["resource", "Habit-stacking worksheet", "Anchor a new workplace habit to something you already do every day so it happens without relying on willpower.", "Worksheet", "habit stacking worksheet"],
  ["video", "Meetings that end with decisions", "How to run a focused meeting with a clear purpose, timeboxed agenda and written decisions, owners and dates at the end.", "6 min", "how to run effective meetings decisions"],
  ["resource", "Meeting summary template", "A three-bullet template for summarising a meeting's decisions, owners and deadlines to share with the team afterwards.", "Template", "meeting summary template decisions action items"],
  ["video", "Saying no without burning bridges", "Ways to decline or renegotiate a request politely while protecting your priorities and keeping the relationship strong.", "5 min", "how to say no at work politely"],
  ["video", "Prioritising when everything is urgent", "Use an urgent/important matrix to decide what to do now, schedule, delegate or drop when your to-do list is overflowing.", "6 min", "eisenhower matrix prioritisation"],
  ["resource", "Weekly priorities planner", "A planner for picking your top three outcomes for the week and blocking time for them before the calendar fills up.", "PDF · 1 page", "weekly priorities planner template"],
  ["video", "Building trust in a new team", "Small, consistent behaviours — following through, admitting mistakes, asking for input — that build trust with colleagues quickly.", "7 min", "how to build trust in a team"],
  ["video", "Asking for help early", "Why asking for help early is a strength, and how to frame a request so colleagues can help you quickly.", "4 min", "how to ask for help at work"],
  ["resource", "Clarifying expectations script", "Questions and phrases for clarifying what's expected on a task — scope, quality, deadline and who decides — before you start.", "Script", "how to clarify expectations at work"],
  ["video", "Handling disagreement constructively", "How to disagree with a colleague or manager respectfully, focus on the problem rather than the person, and reach a decision.", "8 min", "how to disagree constructively at work"],
  ["video", "Giving upward feedback", "How to share honest feedback with your manager in a way that's specific, well-timed and focused on shared goals.", "6 min", "how to give feedback to your manager"],
  ["resource", "Difficult conversation prep sheet", "Prepare for a tough conversation: the facts, your intent, their likely view and the outcome you both need.", "Worksheet", "difficult conversation preparation worksheet"],
  ["video", "Celebrating small wins with your team", "Why noticing progress keeps teams motivated, with quick ways to celebrate small wins in stand-ups and channels.", "4 min", "celebrating small wins at work progress principle"],
  ["video", "Checking in with a struggling teammate", "How to notice when a colleague is struggling, start a supportive check-in conversation and offer practical help.", "5 min", "how to check in on a struggling coworker"],
  ["resource", "1:1 meeting agenda template", "A simple agenda for one-to-one meetings covering wins, blockers, priorities, feedback both ways and development.", "Template", "one on one meeting agenda template"],
  ["video", "Writing clear, short updates", "How to write status updates and emails that lead with the point, state what you need and are easy to act on.", "5 min", "how to write clear concise emails at work"],
  ["video", "Staying calm under pressure", "Quick techniques for pausing, breathing and reframing so you respond rather than react in stressful moments at work.", "6 min", "how to stay calm under pressure at work"],
  ["resource", "Personal reflection journal", "Prompts for reflecting on what changed since your first action: new habits, what worked, and what you want to keep doing.", "PDF · 4 pages", "reflection journal prompts for work growth"],
  ["video", "Making new habits stick", "The cue-routine-reward loop and how to design your environment so a new workplace habit becomes automatic.", "7 min", "how habits form cue routine reward"],
];

if (RESOURCES.length !== 30) throw new Error(`Expected 30 resources, found ${RESOURCES.length}`);

async function seed() {
  const { data: existing, error } = await admin.from("surprise_box_resources").select("title").like("title", `${PREFIX}%`);
  if (error) throw new Error(`Couldn't read surprise_box_resources (is migration 081 applied?): ${error.message}`);
  const existingTitles = new Set((existing ?? []).map((row) => row.title));

  const rows = RESOURCES.map(([kind, title, description, durationLabel, query]) => ({
    title: `${PREFIX}${title}`,
    description,
    kind,
    source: "link",
    external_url: kind === "video" ? youtube(query) : search(query),
    duration_label: durationLabel,
  })).filter((row) => !existingTitles.has(row.title));

  if (!rows.length) {
    console.log("All 30 test resources already exist. Nothing to add.");
    return;
  }
  const { error: insertError } = await admin.from("surprise_box_resources").insert(rows);
  if (insertError) throw new Error(insertError.message);
  console.log(`Added ${rows.length} test resources (${30 - rows.length} already existed).`);
}

async function remove() {
  const { data: rows, error } = await admin.from("surprise_box_resources").select("id, title").like("title", `${PREFIX}%`);
  if (error) throw new Error(error.message);

  let deleted = 0;
  let deactivated = 0;
  for (const row of rows ?? []) {
    const [mapped, unlocked] = await Promise.all([
      admin.from("actions").select("id", { count: "exact", head: true }).eq("surprise_resource_id", row.id),
      admin.from("surprise_box_unlocks").select("id", { count: "exact", head: true }).eq("resource_id", row.id),
    ]);
    if ((mapped.count ?? 0) > 0 || (unlocked.count ?? 0) > 0) {
      const { error: updateError } = await admin.from("surprise_box_resources").update({ is_active: false }).eq("id", row.id);
      if (updateError) throw new Error(updateError.message);
      deactivated += 1;
    } else {
      const { error: deleteError } = await admin.from("surprise_box_resources").delete().eq("id", row.id);
      if (deleteError) throw new Error(deleteError.message);
      deleted += 1;
    }
  }
  console.log(`Deleted ${deleted} test resources; deactivated ${deactivated} that are already matched or unlocked.`);
}

await (process.argv.includes("--remove") ? remove() : seed());
