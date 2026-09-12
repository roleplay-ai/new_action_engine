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

// Matches are keyed by position (1-based index into `actions`/`library`)
// rather than by echoing back the action's UUID or the image's label — small
// "lite" models have been observed corrupting long strings like UUIDs when
// asked to reproduce them verbatim, silently dropping that match. A small
// integer has no such failure mode.
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

function buildMatchPrompt(actions: ActionToMatch[], library: LibraryImage[]): string {
  const libraryBlock = library.map((img, i) => `${i + 1}. ${img.label}`).join("\n");
  const actionsBlock = actions
    .map((a, i) => `${i + 1}. ${a.title}${a.how ? ` — ${a.how}` : ""}`)
    .join("\n");

  return `You pick a stock illustration for each workplace action below, from a FIXED numbered library of images.

IMAGE LIBRARY (numbered 1-${library.length})
${libraryBlock}

ACTIONS (numbered 1-${actions.length})
${actionsBlock}

TASK
For every action number above, return its actionIndex and the imageIndex of the single closest-fitting library image. Match on the underlying situation or interpersonal skill (e.g. asking for clarity, giving feedback, listening, delegating), not on exact wording. Every action must get an imageIndex — always pick whichever library image is the closest available fit, even if none of them is a perfect match. Return exactly one entry per action number, in any order.`;
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

    let parsed: { matches?: Array<{ actionIndex?: number; imageIndex?: number }> };
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error("[action-image-matching] model returned malformed JSON");
      return;
    }

    const updates = (parsed.matches ?? [])
      .map((m) => ({
        action: typeof m.actionIndex === "number" ? actions[m.actionIndex - 1] : undefined,
        url: typeof m.imageIndex === "number" ? library[m.imageIndex - 1]?.url : undefined,
      }))
      .filter((m): m is { action: ActionToMatch; url: string } => !!m.action && !!m.url)
      .map((m) => ({ actionId: m.action.id, url: m.url }));

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
