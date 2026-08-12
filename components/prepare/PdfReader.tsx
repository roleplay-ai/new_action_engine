"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import type { PrepareContentItem } from "@/lib/types";
import PdfEmbedFrame from "@/components/prepare/PdfEmbedFrame";

export default function PdfReader({
  item,
  completed,
  onComplete,
}: {
  item: PrepareContentItem;
  completed: boolean;
  onComplete: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const url = item.prereadUrl!;

  async function handleMarkRead() {
    if (busy || completed) return;
    setBusy(true);
    try {
      await onComplete(item.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="journey-pdf-reader">
      <div className="journey-pdf-reader-frame">
        <PdfEmbedFrame url={url} title={`${item.title} PDF reader`} />
      </div>
      <footer className="journey-pdf-reader-bar">
        {item.description && <p>{item.description}</p>}
        <div className="journey-pdf-reader-actions">
          <a href={url} target="_blank" rel="noopener noreferrer">
            Open in new tab <ExternalLink size={14} strokeWidth={2.5} />
          </a>
          <button
            type="button"
            className={`btn btn--sm ${completed ? "btn--decline" : "btn--accept"}`}
            disabled={busy || completed}
            aria-busy={busy}
            onClick={handleMarkRead}
          >
            {completed ? (
              <><CheckCircle2 size={14} strokeWidth={2.5} /> Read</>
            ) : busy ? (
              <><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Marking…</>
            ) : (
              "Mark as read"
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}
