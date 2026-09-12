// One-time backfill: matches an image to every existing action that predates
// the action-image feature (image_url IS NULL), in batches, using the same
// matching approach as lib/action-image-matching.ts. Safe to re-run — it only
// ever selects rows still missing an image.
//
// Usage:
//   GEMINI_API_KEY=... SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
//     node scripts/backfill-action-images.mjs

import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI, Type } from "@google/genai";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiKey = process.env.GEMINI_API_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
if (!geminiKey) throw new Error("Missing GEMINI_API_KEY");

const model = process.env.GEMINI_IMAGE_MATCH_MODEL || "gemini-3.5-flash-lite";
const BATCH_SIZE = 15;
const DELAY_BETWEEN_BATCHES_MS = 1500;

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const ai = new GoogleGenAI({ apiKey: geminiKey });

const { data: library, error: libErr } = await admin.from("action_images").select("label, url");
if (libErr) throw libErr;
if (!library.length) throw new Error("action_images is empty — run scripts/seed-action-images.mjs first");

// Matches are keyed by position (1-based index), not by echoing back the
// action's UUID or the image's label — small "lite" models have been
// observed corrupting long strings like UUIDs when asked to reproduce them
// verbatim, silently dropping that match. A small integer has no such
// failure mode. See lib/action-image-matching.ts for the same approach.
const matchSchema = {
  type: Type.OBJECT,
  properties: {
    matches: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          actionIndex: { type: Type.INTEGER },
          imageIndex: { type: Type.INTEGER },
        },
        required: ["actionIndex", "imageIndex"],
      },
    },
  },
  required: ["matches"],
};

function buildPrompt(actions) {
  const libraryBlock = library.map((img, i) => `${i + 1}. ${img.label}`).join("\n");
  const actionsBlock = actions.map((a, i) => `${i + 1}. ${a.title}${a.how ? ` — ${a.how}` : ""}`).join("\n");
  return `You pick a stock illustration for each workplace action below, from a FIXED numbered library of images.

IMAGE LIBRARY (numbered 1-${library.length})
${libraryBlock}

ACTIONS (numbered 1-${actions.length})
${actionsBlock}

TASK
For every action number above, return its actionIndex and the imageIndex of the single closest-fitting library image. Match on the underlying situation or interpersonal skill (e.g. asking for clarity, giving feedback, listening, delegating), not on exact wording. Every action must get an imageIndex — always pick whichever library image is the closest available fit, even if none of them is a perfect match. Return exactly one entry per action number, in any order.`;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

let totalMatched = 0;
let totalSeen = 0;
let batchNumber = 0;

for (;;) {
  const { data: rows, error } = await admin
    .from("actions")
    .select("id, title, how, why")
    .is("image_url", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) throw error;
  if (!rows.length) break;

  batchNumber += 1;
  totalSeen += rows.length;
  console.log(`Batch ${batchNumber}: matching ${rows.length} action(s)...`);

  try {
    const response = await ai.models.generateContent({
      model,
      contents: buildPrompt(rows),
      config: { responseMimeType: "application/json", responseSchema: matchSchema },
    });
    const parsed = JSON.parse(response.text ?? "{}");
    const matches = (parsed.matches ?? [])
      .map((m) => ({
        action: typeof m.actionIndex === "number" ? rows[m.actionIndex - 1] : undefined,
        url: typeof m.imageIndex === "number" ? library[m.imageIndex - 1]?.url : undefined,
      }))
      .filter((m) => !!m.action && !!m.url)
      .map((m) => ({ actionId: m.action.id, url: m.url }));

    if (matches.length) {
      await Promise.all(
        matches.map(({ actionId, url: imageUrl }) =>
          admin.from("actions").update({ image_url: imageUrl }).eq("id", actionId)
        )
      );
      totalMatched += matches.length;
    }

    // Rows this batch's model deliberately left unmatched ("") would be
    // re-selected forever (image_url stays NULL). Mark them with an empty
    // string so they're excluded from future runs but still render with no
    // thumbnail (every renderer already treats falsy image_url as "no image").
    const matchedIds = new Set(matches.map((m) => m.actionId));
    const unmatchedIds = rows.map((r) => r.id).filter((id) => !matchedIds.has(id));
    if (unmatchedIds.length) {
      await admin.from("actions").update({ image_url: "" }).in("id", unmatchedIds);
    }

    console.log(`  matched ${matches.length}/${rows.length}`);
  } catch (e) {
    console.error(`  batch ${batchNumber} failed:`, e instanceof Error ? e.message : e);
    // Don't spin forever on a persistent failure (e.g. bad model name).
    if (batchNumber === 1) throw e;
  }

  await sleep(DELAY_BETWEEN_BATCHES_MS);
}

console.log(`\nDone. Matched ${totalMatched}/${totalSeen} action(s) across ${batchNumber} batch(es).`);
