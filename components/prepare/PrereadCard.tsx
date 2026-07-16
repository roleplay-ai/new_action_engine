"use client";

import React, { useState } from "react";
import { FileText, CheckCircle2, ExternalLink } from "lucide-react";
import type { PrepareContentItem } from "@/lib/types";
import { estimateMinutes } from "@/lib/prepare-estimate";

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
  const minutes = estimateMinutes(item);

  async function handleMarkRead() {
    setBusy(true);
    await onComplete(item.id);
    setBusy(false);
  }

  return (
    <div
      className="card card--flat"
      style={{ background: "var(--color-tag-purple-bg)", border: "1px solid rgba(98, 60, 234, 0.20)", maxWidth: "none" }}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          style={{
            width: 36, height: 36, borderRadius: "50%", background: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <FileText size={17} style={{ color: "var(--color-tag-purple-text)" }} strokeWidth={2.5} />
        </div>
        {completed && (
          <span className="tag tag--featured flex items-center gap-1">
            <CheckCircle2 size={13} strokeWidth={2.5} /> Done
          </span>
        )}
      </div>
      <p className="text-xs font-black uppercase tracking-wider mb-1" style={{ color: "var(--color-tag-purple-text)" }}>
        {item.badgeLabel || "Pre-read"}{minutes ? ` · ${minutes} min` : ""}
      </p>
      <h3 style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-bold)", color: "var(--color-text-primary)", marginBottom: 4 }}>
        {item.title}
      </h3>
      {item.description && <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{item.description}</p>}
      {item.prereadBody && (
        <p className="text-sm mt-3" style={{ color: "var(--color-text-secondary)", lineHeight: "var(--leading-relaxed)" }}>
          {item.prereadBody}
        </p>
      )}

      <div className="flex items-center gap-4 mt-4">
        {item.prereadUrl && (
          <a
            href={item.prereadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-bold flex items-center gap-1"
            style={{ color: "var(--color-text-primary)" }}
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
