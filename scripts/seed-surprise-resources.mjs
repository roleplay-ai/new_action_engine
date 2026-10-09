// Seeds the Surprise Box library (supabase/migrations/081_surprise_boxes.sql)
// from "Surpize Box Resources" (Videos + Additional links sheets). Every
// resource is an external link, so nothing is uploaded to the
// surprise-box-resources bucket; YouTube videos get their thumbnail from
// YouTube (youtubeThumbnailUrl in lib/surprise-boxes.ts).
//
// Usage (skips titles that already exist, so it is safe to re-run):
//   node --env-file=.env.local scripts/seed-surprise-resources.mjs

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** [kind, title, description (also what the matcher reads), link] */
const RESOURCES = [
  // People skills
  ["video", "The secret to giving great feedback — LeeAnn Renninger", "LeeAnn Renninger shares a four-part framework for giving clear, constructive feedback that people can act on.", "https://www.youtube.com/watch?v=wtl5UrrgU8c"],
  ["video", "Everyday leadership — Drew Dudley", "Drew Dudley explains how small everyday actions can influence others and make a lasting difference.", "https://www.youtube.com/watch?v=uAy6EawKKME"],
  ["video", "3 steps to getting what you want in a negotiation — Ruchi Sinha", "Ruchi Sinha explains how understanding both sides’ needs and building a relationship can improve negotiations.", "https://www.youtube.com/watch?v=Z3HJCQJ2Lmo"],
  ["video", "6 Elevator Pitches for the 21st Century — Daniel Pink", "Daniel Pink introduces six short pitch formats for communicating ideas and persuading an audience.", "https://www.youtube.com/watch?v=XvxtC60V6kc"],
  ["video", "10 ways to have a better conversation — Celeste Headlee", "Celeste Headlee shares ten habits for better conversations, including staying present, being brief and listening.", "https://www.youtube.com/watch?v=R1vskiVDwl4"],
  ["video", "How to speak so that people want to listen — Julian Treasure", "Julian Treasure explains speaking habits, vocal techniques and exercises that help people listen to you.", "https://www.youtube.com/watch?v=eIho2S0ZahI"],
  ["video", "Confessions of a recovering micromanager — Chieh Huang", "Chieh Huang explains how reducing micromanagement and trusting employees supports creativity and better work.", "https://www.youtube.com/watch?v=1AT5klu_yAQ"],
  ["video", "How to have constructive conversations — Julia Dhar", "Julia Dhar shows how curiosity, openness and a shared purpose make disagreements more constructive.", "https://www.youtube.com/watch?v=BFZtNN6eNvQ"],
  ["video", "5 ways to listen better — Julian Treasure", "Julian Treasure shares five practical exercises for improving conscious listening and understanding others.", "https://www.youtube.com/watch?v=cSohjlYQI2A"],
  ["video", "The happy secret to better work — Shawn Achor", "Shawn Achor argues that a positive mindset can improve productivity and shares habits for building it.", "https://www.youtube.com/watch?v=LqeAiz691-s"],
  // Behavioural clips
  ["video", "Two Monkeys Were Paid Unequally: Excerpt from Frans de Waal’s TED Talk", "Two capuchin monkeys receive different rewards for the same task, illustrating a reaction to unequal treatment.", "https://www.youtube.com/watch?v=meiU6TxysCg"],
  ["video", "Selective attention test", "A basketball-passing task demonstrates how focusing on one activity can make viewers miss an unexpected event.", "https://www.youtube.com/watch?v=vJG698U2Mvo"],
  ["video", "First Follower: Leadership Lessons from Dancing Guy", "A lone dancer attracts followers, showing how the first follower helps turn an individual act into a movement.", "https://www.youtube.com/watch?v=fW8amMCVAJQ"],
  ["video", "The Marshmallow Test — Igniter Media", "Children try to resist eating a marshmallow for a larger reward later in this recreation of a delayed-gratification test.", "https://www.youtube.com/watch?v=QX_oy9614HQ"],
  ["video", "Elevator experiment", "People in an elevator copy the group’s unusual behaviour, illustrating social conformity.", "https://www.youtube.com/watch?v=aOOsfkM-nGQ"],
  ["video", "Asch Conformity Experiment", "A line-judgment experiment demonstrates how pressure from a group can influence an individual’s answer.", "https://www.youtube.com/watch?v=TYIh4MkcfJA"],
  ["video", "The “Door” Study", "A person is replaced during a conversation, demonstrating how people can miss major visual changes.", "https://www.youtube.com/watch?v=FWSxSQsspiQ"],
  ["video", "Piano stairs — The Fun Theory", "Stairs are turned into piano keys to demonstrate how making an activity enjoyable can encourage its use.", "https://www.youtube.com/watch?v=2lXh2n0aPyw"],
  ["video", "Nudging: Just a simple trick can nudge you to eat healthier — iNudgeyou", "An experiment shows how cutting apples into wedges and reducing cake portions can encourage healthier snacking.", "https://www.youtube.com/watch?v=LF4ETgw29BA"],
  ["video", "The Bystander Effect", "Staged distress scenarios illustrate how the presence of other people can reduce an individual’s likelihood of helping.", "https://www.youtube.com/watch?v=OSsPfbup0ac"],
  // Movie trailers
  ["video", "The Pursuit of Happyness (2006) — Official Trailer", "A trailer about a struggling father pursuing a career opportunity while caring for his son and facing homelessness.", "https://www.youtube.com/watch?v=DMOBlEcRuw8"],
  ["video", "Good Will Hunting — Official Trailer", "A trailer about a gifted young janitor whose relationships with a therapist and mentor help him confront his past.", "https://www.youtube.com/watch?v=ReIJ1lbL-Q8"],
  ["video", "The Intouchables (2012) — Official Trailer", "A trailer about the friendship between a wealthy man with paralysis and his caregiver from a different background.", "https://www.youtube.com/watch?v=34WIbmXkewU"],
  ["video", "Remember the Titans (2000) — Trailer", "A trailer about a coach helping a racially divided high-school football team build trust and work together.", "https://www.youtube.com/watch?v=35MvdHBWjwU"],
  ["video", "Forrest Gump — Official 25th Anniversary Trailer", "A trailer following Forrest Gump’s extraordinary life, friendships and perseverance through changing times.", "https://www.youtube.com/watch?v=Mj9IA9tTfio"],
  ["video", "The Secret Life of Walter Mitty — Official Launch Trailer", "A trailer about a daydreaming office worker who takes action and embarks on a real-world adventure.", "https://www.youtube.com/watch?v=XxuYQ1dQtJI"],
  ["video", "October Sky (1999) — Official Trailer", "A trailer about a coal miner’s son who pursues rocketry despite family expectations and limited opportunities.", "https://www.youtube.com/watch?v=zxJQgYPXjN4"],
  ["video", "Hidden Figures — Official Trailer", "A trailer about three Black women at NASA whose expertise helps the space programme despite racial and gender barriers.", "https://www.youtube.com/watch?v=5wfrDhgUMGI"],
  ["video", "Chef — Official Trailer", "A trailer about a chef who starts a food truck, rediscovers his passion for cooking and reconnects with his son.", "https://www.youtube.com/watch?v=5xlHJAEaf-s"],
  ["video", "It’s a Wonderful Life — Official Trailer", "A trailer about George Bailey discovering the difference his life has made to his family and community.", "https://www.youtube.com/watch?v=iLR3gZrU2Xo"],
  // Additional links
  ["video", "Celeste Headlee — companion playlist", "Supplementary playlist supplied alongside Celeste Headlee’s talk.", "https://www.youtube.com/playlist?list=PLYfF89-7GhtGF2y6L0roakq7xHAwDrh5q"],
  ["resource", "Julian Treasure — TED speaker page", "Speaker profile with Julian Treasure’s TED Talks on listening, speaking and sound.", "https://www.ted.com/speakers/julian_treasure"],
  ["resource", "iNudgeyou — healthier eating experiment", "Article describing an experiment using apple wedges and smaller cake portions.", "https://inudgeyou.com/en/new-experiment-just-a-simple-trick-can-nudge-you-to-eat-healthier/"],
];

const { data: existing, error } = await admin.from("surprise_box_resources").select("title");
if (error) throw new Error(`Couldn't read surprise_box_resources (is migration 081 applied?): ${error.message}`);
const existingTitles = new Set((existing ?? []).map((row) => row.title));

const rows = RESOURCES.filter(([, title]) => !existingTitles.has(title)).map(([kind, title, description, url]) => ({
  title,
  description,
  kind,
  source: "link",
  external_url: url,
}));

if (!rows.length) {
  console.log(`All ${RESOURCES.length} resources already exist. Nothing to add.`);
} else {
  const { error: insertError } = await admin.from("surprise_box_resources").insert(rows);
  if (insertError) throw new Error(insertError.message);
  console.log(`Added ${rows.length} resources (${RESOURCES.length - rows.length} already existed).`);
}
