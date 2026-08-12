/** Chrome/WebView on Android cannot render PDFs inside an iframe (blank frame
 * or forced download). iOS Safari is similarly unreliable for inline PDF
 * iframes. Route those clients through Google's public viewer instead. */
export function browserNeedsExternalPdfViewer(
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "",
): boolean {
  if (!userAgent) return false;
  if (/Android/i.test(userAgent)) return true;
  if (/iPhone|iPod|iPad/i.test(userAgent)) return true;
  // iPadOS 13+ often reports as Macintosh with touch
  if (
    typeof navigator !== "undefined" &&
    navigator.platform === "MacIntel" &&
    navigator.maxTouchPoints > 1
  ) {
    return true;
  }
  return false;
}

/** iframe src that actually previews the PDF on the current client. */
export function resolvePdfEmbedSrc(
  url: string,
  hash = "toolbar=1&navpanes=0&scrollbar=1&view=FitH&zoom=page-width",
): string {
  const bare = url.split("#")[0];
  if (browserNeedsExternalPdfViewer()) {
    return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(bare)}`;
  }
  return hash ? `${bare}#${hash}` : bare;
}
