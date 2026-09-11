/**
 * Matches newly generated actions to the closest image in the fixed
 * action-image library (see supabase/migrations/074_action_images.sql and
 * scripts/seed-action-images.mjs), then writes the result onto each
 * actions.image_url.
 *
 * Runs as a fire-and-forget background step (via next/server's `after`)
 * right after a batch of actions is inserted — see
 * app/api/generate-actions-batch/route.ts and
 * app/actions/ai-actions.ts#generateOneMorePersonalAction. It must never
 * throw into its caller: a failed match just leaves image_url null, which
 * every renderer already treats as "no thumbnail".
 */
import { Type } from "@google/genai";
import { getGeminiClient, isGeminiConfigured, GEMINI_IMAGE_MATCH_MODEL } from "@/lib/gemini";
import { callGeminiWithLimit, isRateLimitError } from "@/lib/gemini-limiter";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type ActionToMatch = {
  id: string;
  title: string;
  how?: string | null;
  why?: string | null;
};

type LibraryImage = { label: string; url: string };

const matchSchema = {
  type: Type.OBJECT,
  properties: {
    matches: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          actionId: { type: Type.STRING },
          // Exact library label, or "" when nothing fits reasonably well.
          label: { type: Type.STRING },
        },
        required: ["actionId", "label"],
      },
    },
  },
  required: ["matches"],
};

function buildMatchPrompt(actions: ActionToMatch[], library: LibraryImage[]): string {
  const libraryBlock = library.map((img) => `- ${img.label}`).join("\n");
  const actionsBlock = actions
    .map((a) => `- id: ${a.id}\n  title: ${a.title}${a.how ? `\n  how: ${a.how}` : ""}`)
    .join("\n");

  return `You pick a stock illustration for each workplace action below, from a FIXED library of image labels. Never invent a label — copy one EXACTLY as written in IMAGE LIBRARY, or return an empty string "" if none of them reasonably fit the action's situation or skill.

IMAGE LIBRARY (choose only from these, verbatim)
${libraryBlock}

ACTIONS
${actionsBlock}

TASK
For every action above, return its id and the single best-fitting library label (verbatim), or "" if nothing fits well. Match on the underlying situation or interpersonal skill (e.g. asking for clarity, giving feedback, listening, delegating), not on exact wording. Return exactly one entry per action id, in any order.`;
}

/** All rows in the fixed action-image library. */
export async function getActionImageLibrary(admin: AdminClient): Promise<LibraryImage[]> {
  const { data, error } = await admin.from("action_images").select("label, url");
  if (error) {
    console.error("[action-image-matching] failed to load image library", error.message);
    return [];
  }
  return (data ?? []) as LibraryImage[];
}

/**
 * Matches each of `actions` to a library image (best-effort) and writes
 * actions.image_url for every match found. Swallows all errors — a matching
 * failure must never surface to (or block) the caller.
 */
export async function matchActionImagesForRows(admin: AdminClient, actions: ActionToMatch[]): Promise<void> {
  try {
    if (!actions.length) return;
    if (!isGeminiConfigured()) return;

    const library = await getActionImageLibrary(admin);
    if (!library.length) return;

    const ai = getGeminiClient();
    const response = await callGeminiWithLimit(() =>
      ai.models.generateContent({
        model: GEMINI_IMAGE_MATCH_MODEL,
        contents: buildMatchPrompt(actions, library),
        config: {
          responseMimeType: "application/json",
          responseSchema: matchSchema,
        },
      })
    );

    const text = response.text;
    if (!text) return;

    let parsed: { matches?: Array<{ actionId?: string; label?: string }> };
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error("[action-image-matching] model returned malformed JSON");
      return;
    }

    const urlByLabel = new Map(library.map((img) => [img.label, img.url]));
    const updates = (parsed.matches ?? [])
      .filter((m): m is { actionId: string; label: string } => !!m.actionId && !!m.label)
      .map((m) => ({ actionId: m.actionId, url: urlByLabel.get(m.label) }))
      .filter((m): m is { actionId: string; url: string } => !!m.url);

    if (!updates.length) return;

    // Supabase has no per-row "bulk update with different values" call, so
    // this is one UPDATE per matched action. The batch this runs against is
    // small (a single generation batch, at most BACKGROUND_BATCH_SIZE), and
    // it all happens in the background after the response already went out.
    await Promise.all(
      updates.map(({ actionId, url }) =>
        admin.from("actions").update({ image_url: url }).eq("id", actionId)
      )
    );
  } catch (e) {
    if (isRateLimitError(e)) {
      console.error("[action-image-matching] rate-limited, skipping this batch's image matching");
      return;
    }
    console.error("[action-image-matching] failed", e instanceof Error ? e.message : e);
  }
}
