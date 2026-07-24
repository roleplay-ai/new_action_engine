"use client";

import React, { useState, useEffect } from "react";
import {
  getActionMetrics,
  type ActionMetricEntry,
} from "@/app/actions/admin-analytics";

interface ActionMetricsViewProps {
  companyId: string | null;
}

export function ActionMetricsView({ companyId }: ActionMetricsViewProps) {
  const [actionMetrics, setActionMetrics] = useState<ActionMetricEntry[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setActionMetrics([]);
      setMetricsError(null);
      return;
    }
    setMetricsLoading(true);
    setMetricsError(null);
    getActionMetrics(companyId)
      .then(({ entries, error }) => {
        if (error) {
          setMetricsError(error);
          setActionMetrics([]);
        } else {
          setActionMetrics(entries ?? []);
        }
      })
      .finally(() => setMetricsLoading(false));
  }, [companyId]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="space-y-1">
          <h2 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            Action Metrics
          </h2>
          <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Performance analysis by action
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-lg)" }}>
        <div className="p-4 sm:p-5" style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-base)" }}>
          <h3 className="text-base font-bold" style={{ color: "var(--color-text-primary)" }}>
            Micro-Action Performance Bank
          </h3>
          <p className="text-xs font-medium mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Ranked by conversion % (validated ÷ accepted)
          </p>
        </div>
        <div className="overflow-x-auto">
          {metricsLoading ? (
            <div className="p-8 text-center text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>Loading…</div>
          ) : metricsError ? (
            <div className="p-8 text-center text-sm font-semibold" style={{ color: "var(--color-danger)" }}>{metricsError}</div>
          ) : actionMetrics.length === 0 ? (
            <div className="p-8 text-center text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>No actions yet</div>
          ) : (
            <table className="w-full text-left table-fixed min-w-[720px] text-sm">
              <thead>
                <tr style={{ background: "var(--color-bg-dark)", color: "var(--white)" }}>
                  <th className="px-3 py-3 text-xs font-semibold w-12 text-center">Rank</th>
                  <th className="px-4 py-3 text-xs font-semibold">Action Identification</th>
                  <th className="px-3 py-3 text-xs font-semibold text-center">Accepted</th>
                  <th className="px-3 py-3 text-xs font-semibold text-center">Validated</th>
                  <th className="px-3 py-3 text-xs font-semibold text-center">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {actionMetrics.map((row, index) => (
                  <tr key={row.actionId} className="transition-colors" style={{ borderBottom: "1px solid var(--color-border)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-muted)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="px-3 py-3 text-center">
                      <span className="text-xs font-medium italic" style={{ color: "var(--color-text-muted)" }}>#{index + 1}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold break-words whitespace-normal line-clamp-2 max-w-[520px]" style={{ color: "var(--color-text-primary)" }}>
                        &quot;{row.title}&quot;
                      </p>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-xs font-semibold text-blue-600">{row.acceptedCount}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-xs font-semibold text-emerald-600">{row.validatedCount}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-xs font-bold" style={{ color: "var(--color-text-primary)" }}>{row.conversionPct}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
