import React from "react";

export default function PrepProgressTracker({
  completedCount,
  totalCount,
}: {
  completedCount: number;
  totalCount: number;
}) {
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="card card--flat">
      <div className="flex items-center justify-between mb-2">
        <h3 className="card__title" style={{ marginBottom: 0 }}>Your preparation</h3>
        <span className="tag tag--featured">{pct}%</span>
      </div>
      <p className="card__subtitle mb-3">
        {completedCount} of {totalCount} complete
      </p>
      <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: "var(--color-bg-muted)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: "var(--bright-amber)" }}
        />
      </div>
    </div>
  );
}
