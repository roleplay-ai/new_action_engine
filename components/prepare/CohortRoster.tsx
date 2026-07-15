import React from "react";
import { Users } from "lucide-react";
import type { CohortMember } from "@/lib/types";

export default function CohortRoster({ roster }: { roster: CohortMember[] }) {
  const shown = roster.slice(0, 4);
  const extra = roster.length - shown.length;

  return (
    <div className="card card--flat">
      <div className="flex items-center gap-2 mb-4">
        <Users size={16} style={{ color: "var(--bright-amber)" }} strokeWidth={2.5} />
        <h3 className="card__title" style={{ marginBottom: 0 }}>
          Learn alongside {roster.length} colleague{roster.length === 1 ? "" : "s"}
        </h3>
      </div>
      <div className="flex flex-wrap gap-4">
        {shown.map((m) => (
          <div key={m.id} className="flex flex-col items-center gap-1" style={{ width: 64 }}>
            <div
              style={{
                width: 44, height: 44, borderRadius: "50%",
                background: "var(--color-primary-light)",
                color: "var(--color-text-primary)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: "var(--text-sm)",
              }}
            >
              {(m.fullName ?? "??").substring(0, 2).toUpperCase()}
            </div>
            <span
              className="text-xs text-center truncate"
              style={{ color: "var(--color-text-muted)", maxWidth: 64 }}
              title={m.fullName ?? undefined}
            >
              {m.fullName?.split(" ")[0] ?? "Member"}
            </span>
          </div>
        ))}
        {extra > 0 && (
          <div className="flex flex-col items-center justify-center gap-1" style={{ width: 64 }}>
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
          </div>
        )}
      </div>
    </div>
  );
}
