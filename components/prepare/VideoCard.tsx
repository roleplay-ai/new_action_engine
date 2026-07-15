"use client";

import React, { useState } from "react";
import { PlayCircle, CheckCircle2, ExternalLink } from "lucide-react";
import type { PrepareContentItem } from "@/lib/types";
import { resolveVideoEmbed } from "@/lib/video-embed";

export default function VideoCard({
  item,
  completed,
  onComplete,
}: {
  item: PrepareContentItem;
  completed: boolean;
  onComplete: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [embedFailed, setEmbedFailed] = useState(false);

  async function handleMarkWatched() {
    setBusy(true);
    await onComplete(item.id);
    setBusy(false);
  }

  const embed = item.videoUrl ? resolveVideoEmbed(item.videoUrl) : null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <span className="tag tag--blue flex items-center gap-1.5">
          <PlayCircle size={13} strokeWidth={2.5} /> Video
        </span>
        {completed && (
          <span className="tag tag--featured flex items-center gap-1">
            <CheckCircle2 size={13} strokeWidth={2.5} /> Done
          </span>
        )}
      </div>
      <h3 className="card__title">{item.title}</h3>
      {item.description && <p className="card__subtitle">{item.description}</p>}

      {embed && !embedFailed && (
        <div style={{ aspectRatio: "16 / 9", marginTop: 12, marginBottom: 12 }}>
          {embed.kind === "file" ? (
            <video
              src={embed.src}
              controls
              onError={() => setEmbedFailed(true)}
              style={{ width: "100%", height: "100%", borderRadius: "var(--radius-lg)", background: "#000" }}
            />
          ) : (
            <iframe
              src={embed.src}
              title={item.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              onError={() => setEmbedFailed(true)}
              style={{ width: "100%", height: "100%", borderRadius: "var(--radius-lg)", border: "none" }}
            />
          )}
        </div>
      )}

      {embed && embedFailed && (
        <div className="card__inset text-center" style={{ marginTop: 12, marginBottom: 12 }}>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            This video can&apos;t be played here.
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        {embed && (
          <a href={embed.originalUrl} target="_blank" rel="noopener noreferrer" className="btn btn--decline btn--sm">
            Open video <ExternalLink size={14} strokeWidth={2.5} />
          </a>
        )}
        <button
          onClick={handleMarkWatched}
          disabled={busy || completed}
          className={`btn btn--sm ${completed ? "btn--decline" : "btn--accept"}`}
        >
          {completed ? "Watched" : busy ? "…" : "Mark as watched"}
        </button>
      </div>
    </div>
  );
}
