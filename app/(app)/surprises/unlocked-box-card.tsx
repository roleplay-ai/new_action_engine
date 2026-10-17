"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, FileText, Play } from "lucide-react";
import { Gift, giftVariant } from "@/components/SurpriseBoxes";
import type { SurpriseShelfBox } from "@/lib/surprise-boxes";
import { resolveVideoEmbed } from "@/lib/video-embed";
import { browserNeedsExternalPdfViewer } from "@/lib/pdf-embed";

const isPdf = (url: string) => /\.pdf(\?.*)?$/i.test(url.split("#")[0]);

/**
 * Thumbnail for an opened box: the resource's own thumbnail (uploaded, or
 * YouTube's), else the first frame of an uploaded video or the first page of
 * a PDF where the browser can show it inline, else an icon.
 */
function PrizeThumbnail({ box }: { box: SurpriseShelfBox }) {
  const prize = box.prize!;
  const [inlinePdf, setInlinePdf] = useState(false);
  useEffect(() => setInlinePdf(!browserNeedsExternalPdfViewer()), []);

  if (prize.thumbnailUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={prize.thumbnailUrl} alt="" loading="lazy" />;
  }
  if (prize.kind === "video" && resolveVideoEmbed(prize.url).kind === "file") {
    return <video src={`${prize.url.split("#")[0]}#t=0.5`} muted playsInline preload="metadata" tabIndex={-1} />;
  }
  if (prize.kind === "resource" && isPdf(prize.url) && inlinePdf) {
    return <iframe src={`${prize.url.split("#")[0]}#page=1&view=FitH&toolbar=0&navpanes=0`} title="" tabIndex={-1} loading="lazy" aria-hidden="true" />;
  }
  return <span className="unlocked-box-icon">{prize.kind === "video" ? <Play size={28} fill="currentColor" /> : <FileText size={28} />}</span>;
}

/** An opened Surprise Box on /surprises: thumbnail, kind, title, and a link to the content. */
export default function UnlockedBoxCard({ box, isNew }: { box: SurpriseShelfBox; isNew?: boolean }) {
  const prize = box.prize;

  if (!prize) {
    return (
      <article className="unlocked-box-card is-pending">
        <div className="unlocked-box-thumb"><Gift variant={giftVariant(box)} /></div>
        <div className="unlocked-box-body">
          <small>Box {box.slot}</small>
          <strong>Your trainer is preparing this one</strong>
          <p>Check back soon. It will appear here when it&apos;s ready.</p>
        </div>
      </article>
    );
  }

  const isVideo = prize.kind === "video";
  return (
    <a
      className={`unlocked-box-card${isNew ? " is-new" : ""}`}
      href={prize.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${isVideo ? "Watch" : "Open"} ${prize.title} (opens in a new tab)`}
    >
      <div className={`unlocked-box-thumb ${prize.kind}`}>
        <PrizeThumbnail box={box} />
        <span className="unlocked-box-kind">{isVideo ? "Video" : "Resource"}</span>
        {prize.durationLabel && <span className="unlocked-box-duration">{prize.durationLabel}</span>}
        {isVideo && <span className="unlocked-box-play" aria-hidden="true"><Play size={16} fill="currentColor" /></span>}
      </div>
      <div className="unlocked-box-body">
        <small>Box {box.slot} · {box.actionTitle}</small>
        <strong>{prize.title}</strong>
        <p>{prize.description}</p>
        <span className="unlocked-box-link">{isVideo ? "Watch" : "Open"} <ArrowUpRight size={14} /></span>
      </div>
    </a>
  );
}
