"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink } from "lucide-react";
import type { PrepareContentItem } from "@/lib/types";

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
    setBusy(true);
    await onComplete(item.id);
    setBusy(false);
  }

  return (
    <div className="journey-pdf-reader">
      <div className="journey-pdf-reader-frame">
        <iframe
          src={`${url}#toolbar=1&navpanes=0&scrollbar=1&view=FitH&zoom=page-width`}
          title={`${item.title} PDF reader`}
        />
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
            onClick={handleMarkRead}
          >
            {completed ? (
              <><CheckCircle2 size={14} strokeWidth={2.5} /> Read</>
            ) : busy ? "…" : "Mark as read"}
          </button>
        </div>
      </footer>
    </div>
  );
}
