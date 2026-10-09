/**
 * Shared Surprise Box types, constants and input validation
 * (supabase/migrations/081_surprise_boxes.sql, docs/SURPRISE_BOXES_PLAN.md).
 * Pure module: safe to import from server actions, client components and tests.
 */

export const SURPRISE_BOX_BUCKET = "surprise-box-resources";

/** Library size the superadmin page asks for before launch (a warning, not a block). */
export const SURPRISE_LIBRARY_TARGET = 30;

export const SURPRISE_TITLE_MAX = 120;
/** The description drives the Gemini action-to-resource matcher, so it must say what the resource is about. */
export const SURPRISE_DESCRIPTION_MIN = 20;
export const SURPRISE_DESCRIPTION_MAX = 600;
export const SURPRISE_DURATION_LABEL_MAX = 40;

export type SurpriseResourceKind = "video" | "resource";
export type SurpriseResourceSource = "upload" | "link";

export type SurpriseResource = {
  id: string;
  title: string;
  description: string;
  kind: SurpriseResourceKind;
  source: SurpriseResourceSource;
  storagePath: string | null;
  externalUrl: string | null;
  thumbnailPath: string | null;
  durationLabel: string | null;
  isActive: boolean;
  createdAt: string;
  /** Public URL a participant opens: the bucket file or the external link. */
  url: string;
  thumbnailUrl: string | null;
  /** Plan actions the matcher has mapped to this resource. */
  mappedActionCount: number;
  /** Boxes already unlocked with this resource. */
  unlockCount: number;
};

export type SurpriseResourceInput = {
  title: string;
  description: string;
  kind: SurpriseResourceKind;
  source: SurpriseResourceSource;
  storagePath?: string | null;
  externalUrl?: string | null;
  thumbnailPath?: string | null;
  durationLabel?: string | null;
};

/** Upload types the bucket accepts, by what the file is used for. */
export const SURPRISE_UPLOAD_TYPES = {
  video: ["video/mp4", "video/webm", "video/quicktime"],
  resource: ["application/pdf"],
  thumbnail: ["image/png", "image/jpeg", "image/webp", "image/gif"],
} as const;

export type SurpriseUploadPurpose = keyof typeof SURPRISE_UPLOAD_TYPES;

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * YouTube's own thumbnail for a single-video link (watch, youtu.be, shorts,
 * embed). Null for playlists, channels and non-YouTube links.
 */
export function youtubeThumbnailUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^(www|m)\./, "");
  const id =
    host === "youtu.be"
      ? parsed.pathname.slice(1)
      : host === "youtube.com"
        ? parsed.pathname === "/watch"
          ? parsed.searchParams.get("v")
          : parsed.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1]
        : null;
  return id && /^[\w-]{11}$/.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

/** Storage paths are generated server-side as `<folder>/<uuid>.<ext>`; reject anything else. */
export function isSurpriseStoragePath(value: string, folder: "resources" | "thumbnails"): boolean {
  return new RegExp(`^${folder}/[0-9a-f-]{36}\\.[a-z0-9]{1,10}$`).test(value);
}

/**
 * Trims and checks a create/update payload. Returns the cleaned row values or
 * the first problem, phrased for the superadmin form.
 */
export function validateSurpriseResourceInput(
  input: SurpriseResourceInput
): { value: Required<SurpriseResourceInput> } | { error: string } {
  const title = input.title?.trim() ?? "";
  const description = input.description?.trim() ?? "";
  const durationLabel = input.durationLabel?.trim() || null;
  const thumbnailPath = input.thumbnailPath?.trim() || null;

  if (!title) return { error: "Add a title." };
  if (title.length > SURPRISE_TITLE_MAX) return { error: `Keep the title under ${SURPRISE_TITLE_MAX} characters.` };
  if (description.length < SURPRISE_DESCRIPTION_MIN) {
    return { error: `Describe what the resource is about in at least ${SURPRISE_DESCRIPTION_MIN} characters — it's used to match it to actions.` };
  }
  if (description.length > SURPRISE_DESCRIPTION_MAX) {
    return { error: `Keep the description under ${SURPRISE_DESCRIPTION_MAX} characters.` };
  }
  if (input.kind !== "video" && input.kind !== "resource") return { error: "Choose Video or Resource." };
  if (durationLabel && durationLabel.length > SURPRISE_DURATION_LABEL_MAX) {
    return { error: `Keep the length label under ${SURPRISE_DURATION_LABEL_MAX} characters.` };
  }
  if (thumbnailPath && !isSurpriseStoragePath(thumbnailPath, "thumbnails")) {
    return { error: "Upload the cover image again." };
  }

  if (input.source === "upload") {
    const storagePath = input.storagePath?.trim() ?? "";
    if (!storagePath) return { error: "Upload a file, or switch to Paste link." };
    if (!isSurpriseStoragePath(storagePath, "resources")) return { error: "Upload the file again." };
    return {
      value: { title, description, kind: input.kind, source: "upload", storagePath, externalUrl: null, thumbnailPath, durationLabel },
    };
  }

  if (input.source === "link") {
    const externalUrl = input.externalUrl?.trim() ?? "";
    if (!externalUrl) return { error: "Paste a link, or switch to Upload file." };
    if (!isHttpUrl(externalUrl)) return { error: "Use a full link starting with https://" };
    return {
      value: { title, description, kind: input.kind, source: "link", storagePath: null, externalUrl, thumbnailPath, durationLabel },
    };
  }

  return { error: "Choose Upload file or Paste link." };
}

/** File extension for an upload, limited to what the bucket accepts for that purpose. */
export function surpriseUploadExtension(purpose: SurpriseUploadPurpose, mimeType: string): string | null {
  if (!(SURPRISE_UPLOAD_TYPES[purpose] as readonly string[]).includes(mimeType)) return null;
  const extensions: Record<string, string> = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return extensions[mimeType] ?? null;
}

// ---------------------------------------------------------------------------
// Action-to-resource matching helpers (used by lib/surprise-resource-matching.ts)
// ---------------------------------------------------------------------------

/**
 * Reads the matcher's `{ matches: [{ actionIndex, resourceIndex }] }` JSON.
 * Indexes are 1-based positions in the prompt's lists. Returns a 0-based
 * action → resource map, dropping malformed, out-of-range and repeated entries
 * (first answer for an action wins).
 */
export function parseResourceMatches(text: string, actionCount: number, resourceCount: number): Map<number, number> {
  const matches = new Map<number, number>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return matches;
  }
  const entries = (parsed as { matches?: unknown })?.matches;
  if (!Array.isArray(entries)) return matches;

  for (const entry of entries) {
    const { actionIndex, resourceIndex } = (entry ?? {}) as { actionIndex?: unknown; resourceIndex?: unknown };
    if (!Number.isInteger(actionIndex) || !Number.isInteger(resourceIndex)) continue;
    const action = (actionIndex as number) - 1;
    const resource = (resourceIndex as number) - 1;
    if (action < 0 || action >= actionCount || resource < 0 || resource >= resourceCount) continue;
    if (!matches.has(action)) matches.set(action, resource);
  }
  return matches;
}

/**
 * Gives every action in `actionIds` without an assignment the least-used
 * resource (ties go to the earliest in `resourceIds`), counting both `usage`
 * and assignments made so far. Mutates and returns `assignments`; updates
 * `usage` so later calls keep spreading resources out.
 */
export function fillWithLeastUsed(
  actionIds: string[],
  assignments: Map<string, string>,
  resourceIds: string[],
  usage: Map<string, number>
): Map<string, string> {
  if (!resourceIds.length) return assignments;
  for (const actionId of actionIds) {
    if (assignments.has(actionId)) continue;
    let best = resourceIds[0];
    for (const id of resourceIds) {
      if ((usage.get(id) ?? 0) < (usage.get(best) ?? 0)) best = id;
    }
    assignments.set(actionId, best);
    usage.set(best, (usage.get(best) ?? 0) + 1);
  }
  return assignments;
}

// ---------------------------------------------------------------------------
// Participant shelf (Commitment Wallet)
// ---------------------------------------------------------------------------

/**
 * opened — unlocked and viewed; ready — unlocked but the reveal was closed
 * before opening; next — the first box still to earn; missed — its action was
 * missed (completing it late still opens it); locked — everything else.
 */
export type SurpriseBoxState = "opened" | "ready" | "next" | "missed" | "locked";

/** What a participant sees inside an unlocked box. */
export type SurprisePrize = {
  kind: SurpriseResourceKind;
  title: string;
  description: string;
  durationLabel: string | null;
  url: string;
  thumbnailUrl: string | null;
};

export type SurpriseShelfBox = {
  slot: number;
  actionId: string;
  actionTitle: string;
  state: SurpriseBoxState;
  unlockId: string | null;
  /** Null when locked, or when the library was empty at unlock time. */
  prize: SurprisePrize | null;
};

export type SurpriseShelf = {
  /** False for plans finalised before Surprise Boxes launched: every box stays locked. */
  enabled: boolean;
  boxes: SurpriseShelfBox[];
  unlockedCount: number;
};

export type ShelfActionInput = {
  actionId: string;
  actionTitle: string;
  /** user_actions.status, or null when the action hasn't been delivered yet. */
  status: string | null;
};

export type ShelfUnlockInput = { unlockId: string; openedAt: string | null; prize: SurprisePrize | null };

/** Builds the shelf from plan actions in delivery order plus the participant's unlocks. */
export function buildSurpriseShelf(
  actions: ShelfActionInput[],
  unlocksByAction: Map<string, ShelfUnlockInput>,
  enabled: boolean
): SurpriseShelf {
  let nextAssigned = !enabled;

  const boxes = actions.map((action, index): SurpriseShelfBox => {
    const slot = index + 1;
    const unlock = enabled ? unlocksByAction.get(action.actionId) : undefined;
    const base = { slot, actionId: action.actionId, actionTitle: action.actionTitle };

    if (unlock) {
      return { ...base, state: unlock.openedAt ? "opened" : "ready", unlockId: unlock.unlockId, prize: unlock.prize };
    }
    if (enabled && (action.status === "failed" || action.status === "skipped")) {
      return { ...base, state: "missed", unlockId: null, prize: null };
    }
    if (!nextAssigned) {
      nextAssigned = true;
      return { ...base, state: "next", unlockId: null, prize: null };
    }
    return { ...base, state: "locked", unlockId: null, prize: null };
  });

  return { enabled, boxes, unlockedCount: boxes.filter((box) => box.unlockId).length };
}
