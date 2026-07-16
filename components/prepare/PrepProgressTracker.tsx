import React from "react";
import { Check, ArrowRight } from "lucide-react";
import type { PrepareContentItem, UserPrepareProgress } from "@/lib/types";
import { estimateMinutes, formatMinutes } from "@/lib/prepare-estimate";

export interface PrepChecklistItem {
  item: PrepareContentItem;
  status: UserPrepareProgress["status"];
}

export default function PrepProgressTracker({
  checklist,
  completedCount,
  totalCount,
  deadlineLabel,
}: {
  checklist: PrepChecklistItem[];
  completedCount: number;
  totalCount: number;
  deadlineLabel?: string | null;
}) {
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  function handleContinue() {
    const next = checklist.find((c) => c.status !== "completed");
    if (!next) return;
    document.getElementById(`prepare-item-${next.item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <aside className="card" style={{ position: "sticky", top: 24 }}>
      <span className="tag tag--featured mb-3 inline-block">Your preparation</span>
      <div className="flex items-center justify-between mb-1">
        <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)", color: "var(--color-text-primary)" }}>
          {completedCount} of {totalCount} complete
        </h2>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)", color: "var(--bright-amber)" }}>{pct}%</span>
      </div>

      <div className="w-full h-2 rounded-full overflow-hidden mb-5" style={{ background: "var(--color-bg-muted)" }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: "var(--bright-amber)" }} />
      </div>

      <ul className="space-y-3 mb-5">
        {checklist.map(({ item, status }, i) => {
          const done = status === "completed";
          const minutes = formatMinutes(estimateMinutes(item));
          return (
            <li key={item.id} className="flex items-center gap-3">
              <span
                style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)",
                  background: done ? "var(--emerald)" : "var(--color-bg-muted)",
                  color: done ? "#fff" : "var(--color-text-muted)",
                }}
              >
                {done ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span
                  className="block text-sm font-semibold truncate"
                  style={{
                    color: done ? "var(--color-text-muted)" : "var(--color-text-primary)",
                    textDecoration: done ? "line-through" : "none",
                  }}
                  title={item.title}
                >
                  {item.title}
                </span>
              </span>
              {minutes && (
                <span className="text-xs shrink-0" style={{ color: "var(--color-text-muted)" }}>{minutes}</span>
              )}
            </li>
          );
        })}
      </ul>

      {completedCount < totalCount && (
        <button onClick={handleContinue} className="btn btn--primary btn--full btn--sm">
          Continue preparation <ArrowRight size={14} strokeWidth={2.5} />
        </button>
      )}

      {deadlineLabel && (
        <p className="text-xs text-center mt-3" style={{ color: "var(--color-text-muted)" }}>
          {deadlineLabel}
        </p>
      )}
    </aside>
  );
}
