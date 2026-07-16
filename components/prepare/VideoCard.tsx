"use client";

import React, { useState } from "react";
import { Play, CheckCircle2, ExternalLink } from "lucide-react";
import type { PrepareContentItem } from "@/lib/types";
import { resolveVideoEmbed } from "@/lib/video-embed";

export default function VideoCard({
  item,
  completed,
  onComplete,
  accentColor = "#FADCC0",
}: {
  item: PrepareContentItem;
  completed: boolean;
  onComplete: (id: string) => Promise<void>;
  accentColor?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [embedFailed, setEmbedFailed] = useState(false);
  const [playing, setPlaying] = useState(false);

  async function handleMarkWatched() {
    setBusy(true);
    await onComplete(item.id);
    setBusy(false);
  }

  const embed = item.videoUrl ? resolveVideoEmbed(item.videoUrl) : null;
  const badge = item.badgeLabel || "Video";

  return (
    <div className="card card--flat" style={{ padding: 0, overflow: "hidden", maxWidth: "none" }}>
      <div
        style={{
          position: "relative", aspectRatio: "16 / 9",
          background: playing ? "#000" : accentColor,
          cursor: embed && !playing ? "pointer" : "default",
        }}
        onClick={() => embed && !playing && setPlaying(true)}
      >
        <span
          className="absolute"
          style={{
            position: "absolute", top: 12, left: 12,
            background: "rgba(255,255,255,0.92)", color: "var(--color-text-primary)",
            fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)",
            padding: "4px 12px", borderRadius: "var(--radius-pill)",
            letterSpacing: "0.04em", textTransform: "uppercase", zIndex: 2,
          }}
        >
          {badge}
        </span>

        {!playing && (
          <div
            style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.9)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
              }}
            >
              <Play size={22} style={{ color: "var(--color-text-primary)", marginLeft: 3 }} fill="currentColor" />
            </div>
          </div>
        )}

        {playing && embed && !embedFailed && (
          embed.kind === "file" ? (
            <video
              src={embed.src}
              controls
              autoPlay
              onError={() => setEmbedFailed(true)}
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <iframe
              src={embed.src}
              title={item.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              onError={() => setEmbedFailed(true)}
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          )
        )}

        {playing && embedFailed && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs font-semibold text-white">This video can&apos;t be played here.</p>
          </div>
        )}
      </div>

      <div style={{ padding: "var(--space-6)" }}>
        <div className="flex items-center justify-between mb-1">
          <h3 style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-bold)", color: "var(--color-text-primary)" }}>
            {item.title}
          </h3>
          {completed && (
            <span className="tag tag--featured flex items-center gap-1 shrink-0">
              <CheckCircle2 size={13} strokeWidth={2.5} /> Done
            </span>
          )}
        </div>
        {item.description && (
          <p className="text-sm" style={{ color: "var(--dodger-blue)", fontWeight: "var(--weight-semibold)" }}>
            {item.description}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2 mt-4">
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
    </div>
  );
}
