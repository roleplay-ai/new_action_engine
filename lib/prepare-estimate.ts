import type { PrepareContentItem } from "@/lib/types";

/** Best-effort "N min" estimate for a Prepare item, derived from whatever data
 * is actually available (no separate duration field exists for quiz/pre-read). */
export function estimateMinutes(item: PrepareContentItem): number | null {
  if (item.type === "video") {
    return item.videoDurationSeconds ? Math.max(1, Math.round(item.videoDurationSeconds / 60)) : null;
  }
  if (item.type === "quiz") {
    return item.questionCount ? Math.max(1, Math.round(item.questionCount * 0.75)) : null;
  }
  if (item.type === "preread") {
    if (!item.prereadBody) return null;
    const words = item.prereadBody.trim().split(/\s+/).filter(Boolean).length;
    return words ? Math.max(1, Math.round(words / 200)) : null;
  }
  return null;
}

export function formatMinutes(minutes: number | null): string | null {
  return minutes ? `${minutes} min` : null;
}
