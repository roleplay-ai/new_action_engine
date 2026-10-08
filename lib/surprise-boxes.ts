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
