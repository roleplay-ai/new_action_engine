"use client";

import { useEffect, useState } from "react";
import { resolvePdfEmbedSrc } from "@/lib/pdf-embed";

/** Renders a PDF in an iframe. On Android/iOS (no reliable native PDF iframe)
 * switches to Google's viewer after mount to avoid a hydration mismatch. */
export default function PdfEmbedFrame({
  url,
  title,
  hash = "toolbar=1&navpanes=0&scrollbar=1&view=FitH&zoom=page-width",
  loading,
  tabIndex,
}: {
  url: string;
  title: string;
  hash?: string;
  loading?: "lazy" | "eager";
  tabIndex?: number;
}) {
  // Desktop-safe default for SSR / first paint; mobile swaps in useEffect.
  const [src, setSrc] = useState(() => {
    const bare = url.split("#")[0];
    return hash ? `${bare}#${hash}` : bare;
  });

  useEffect(() => {
    setSrc(resolvePdfEmbedSrc(url, hash));
  }, [url, hash]);

  return <iframe src={src} title={title} loading={loading} tabIndex={tabIndex} />;
}
