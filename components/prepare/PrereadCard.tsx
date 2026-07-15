"use client";

import React, { useState } from "react";
import { FileText, CheckCircle2, ExternalLink } from "lucide-react";
import type { PrepareContentItem } from "@/lib/types";

export default function PrereadCard({
  item,
  completed,
  onComplete,
}: {
  item: PrepareContentItem;
  completed: boolean;
  onComplete: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function handleMarkRead() {
    setBusy(true);
    await onComplete(item.id);
    setBusy(false);
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <span className="tag tag--orange flex items-center gap-1.5">
          <FileText size={13} strokeWidth={2.5} /> Pre-read
        </span>
        {completed && (
          <span className="tag tag--featured flex items-center gap-1">
            <CheckCircle2 size={13} strokeWidth={2.5} /> Done
          </span>
        )}
      </div>
      <h3 className="card__title">{item.title}</h3>
      {item.description && <p className="card__subtitle">{item.description}</p>}
      {item.prereadBody && (
        <p className="text-sm mt-3" style={{ color: "var(--color-text-secondary)", lineHeight: "var(--leading-relaxed)" }}>
          {item.prereadBody}
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mt-4">
        {item.prereadUrl && (
          <a
            href={item.prereadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--decline btn--sm"
          >
            Open resource <ExternalLink size={14} strokeWidth={2.5} />
          </a>
        )}
        <button
          onClick={handleMarkRead}
          disabled={busy || completed}
          className={`btn btn--sm ${completed ? "btn--decline" : "btn--accept"}`}
        >
          {completed ? "Read" : busy ? "…" : "Mark as read"}
        </button>
      </div>
    </div>
  );
}
