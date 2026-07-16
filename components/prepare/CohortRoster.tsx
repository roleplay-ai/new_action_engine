"use client";

import React, { useState } from "react";
import type { CohortMember } from "@/lib/types";

const AVATAR_COLORS = ["#FADCC0", "#D7ECFC", "#E0D6F5", "#C9F0DC"];

export default function CohortRoster({ roster }: { roster: CohortMember[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? roster : roster.slice(0, 4);
  const extra = roster.length - shown.length;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="tag tag--blue mb-2 inline-block">Your cohort</span>
          <h2
            style={{
              fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)",
              color: "var(--color-text-primary)", letterSpacing: "-0.01em",
            }}
          >
            Learn alongside {roster.length} colleague{roster.length === 1 ? "" : "s"}
          </h2>
        </div>
        {roster.length > 4 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-sm font-bold whitespace-nowrap"
            style={{ color: "var(--color-text-primary)" }}
          >
            {expanded ? "Show less" : "View everyone →"}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-5">
        {shown.map((m, i) => (
          <div key={m.id} className="flex flex-col items-center gap-1.5" style={{ width: 64 }}>
            <div
              style={{
                width: 44, height: 44, borderRadius: "50%",
                background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                color: "var(--color-text-primary)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: "var(--text-sm)",
              }}
            >
              {(m.fullName ?? "??").substring(0, 2).toUpperCase()}
            </div>
            <span
              className="text-xs text-center truncate font-semibold"
              style={{ color: "var(--color-text-primary)", maxWidth: 64 }}
              title={m.fullName ?? undefined}
            >
              {m.fullName?.split(" ")[0] ?? "Member"}
            </span>
          </div>
        ))}
        {!expanded && extra > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="flex flex-col items-center justify-center gap-1.5"
            style={{ width: 64 }}
          >
            <div
              style={{
                width: 44, height: 44, borderRadius: "50%",
                background: "var(--color-bg-muted)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: "var(--text-sm)",
                color: "var(--color-text-muted)",
              }}
            >
              +{extra}
            </div>
            <span className="text-xs text-center" style={{ color: "var(--color-text-muted)" }}>
              more
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
