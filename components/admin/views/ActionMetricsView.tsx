"use client";

import React, { useState, useEffect } from "react";
import { Target } from "lucide-react";
import {
  getDriversEffectiveness,
  getActionMetrics,
  type DriversEffectivenessEntry,
  type ActionMetricEntry,
} from "@/app/actions/admin-analytics";

const THEME_CHART_COLORS: Record<string, string> = {
  Collaboration: "#60a5fa",
  Accountability: "#f87171",
  Feedback: "#4ade80",
  Connection: "#fbbf24",
  Coaching: "#a78bfa",
};

interface ActionMetricsViewProps {
  companyId: string | null;
}

export function ActionMetricsView({ companyId }: ActionMetricsViewProps) {
  const [driversData, setDriversData] = useState<DriversEffectivenessEntry[]>(
    []
  );
  const [actionMetrics, setActionMetrics] = useState<ActionMetricEntry[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [driversError, setDriversError] = useState<string | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setDriversData([]);
      setActionMetrics([]);
      setDriversError(null);
      setMetricsError(null);
      return;
    }
    setDriversLoading(true);
    setDriversError(null);
    getDriversEffectiveness(companyId)
      .then(({ entries, error }) => {
        if (error) {
          setDriversError(error);
          setDriversData([]);
        } else {
          setDriversData(entries ?? []);
        }
      })
      .finally(() => setDriversLoading(false));
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
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
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="space-y-1">
          <h2 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            Action Metrics
          </h2>
          <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Performance analysis by action &amp; theme
          </p>
        </div>
      </div>

      {/* Organizational Skill Drivers */}
      <div className="bg-white rounded-2xl p-4 sm:p-6" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-lg)" }}>
        <h3 className="text-base font-bold mb-1 flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
          <Target size={16} className="text-red-500" /> Organizational Skill Drivers
        </h3>
        <p className="text-xs font-medium mb-4" style={{ color: "var(--color-text-muted)" }}>
          % of actions accepted by theme (all users)
        </p>
        {driversLoading ? (
          <div className="py-6 text-center text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>Loading…</div>
        ) : driversError ? (
          <div className="py-6 text-center text-sm font-semibold" style={{ color: "var(--color-danger)" }}>{driversError}</div>
        ) : driversData.length === 0 ? (
          <div className="py-6 text-center text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>No theme data yet</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {driversData.map((driver) => (
              <div key={driver.theme} className="space-y-2">
                <div className="flex justify-between items-end">
                  <span className="text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>{driver.theme}</span>
                  <span className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>{driver.acceptancePct}%</span>
                </div>
                <div className="h-3 w-full rounded-full overflow-hidden" style={{ background: "var(--color-bg-muted)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${driver.acceptancePct}%`,
                      backgroundColor: THEME_CHART_COLORS[driver.theme] ?? "#94a3b8",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Micro-Action Performance Bank */}
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
                      <div className="space-y-0.5">
                        <p className="text-xs font-semibold break-words whitespace-normal line-clamp-2 max-w-[520px]" style={{ color: "var(--color-text-primary)" }}>
                          &quot;{row.title}&quot;
                        </p>
                        <span className="tag tag--blue">{row.theme}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-xs font-semibold text-blue-600">{row.acceptedCount}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-xs font-semibold text-emerald-600">{row.validatedCount}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-bg-muted)" }}>
                          <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(100, row.conversionPct)}%` }} />
                        </div>
                        <span className="text-xs font-semibold">{row.acceptedCount > 0 ? `${row.conversionPct}%` : "—"}</span>
                      </div>
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
