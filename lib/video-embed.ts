/** Normalises a pasted video URL (YouTube/Vimeo share links, direct file links, or
 * an already-embeddable URL) into something that actually renders inside an <iframe>
 * or <video> tag, plus the original URL to fall back to as an "Open video" link. */
export function resolveVideoEmbed(url: string): {
  kind: "iframe" | "file";
  src: string;
  originalUrl: string;
} {
  const trimmed = url.trim();

  const youtubeWatch = trimmed.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (youtubeWatch) {
    return { kind: "iframe", src: `https://www.youtube.com/embed/${youtubeWatch[1]}`, originalUrl: trimmed };
  }

  const youtubeShorts = trimmed.match(/youtube\.com\/shorts\/([\w-]+)/);
  if (youtubeShorts) {
    return { kind: "iframe", src: `https://www.youtube.com/embed/${youtubeShorts[1]}`, originalUrl: trimmed };
  }

  const vimeo = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo && !trimmed.includes("player.vimeo.com")) {
    return { kind: "iframe", src: `https://player.vimeo.com/video/${vimeo[1]}`, originalUrl: trimmed };
  }

  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(trimmed)) {
    return { kind: "file", src: trimmed, originalUrl: trimmed };
  }

  // Already an embed URL (youtube.com/embed/…, player.vimeo.com/…) or some other
  // embeddable host — pass through as-is.
  return { kind: "iframe", src: trimmed, originalUrl: trimmed };
}
