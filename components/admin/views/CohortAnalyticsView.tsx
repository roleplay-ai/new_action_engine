"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import {
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
} from "recharts";
import {
  getCohortAnalyticsOverview,
  getCohortAnalyticsDetail,
  type CohortAnalyticsSummary,
  type CohortAnalyticsDetail,
} from "@/app/actions/admin-analytics";
import { makeWeekChartTick, weekChartLabelFormatter, weekChartRange } from "@/components/admin/WeekChartTick";

interface CohortAnalyticsViewProps {
  companyId: string | null;
}

function initials(value: string) {
  const words = value.trim().split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase()).join("") || "C";
}

function commitmentBadgeColor(pct: number, hasPlan: boolean) {
  if (!hasPlan) return "bg-gray-100 text-gray-400";
  if (pct >= 90) return "bg-purple-600 text-white";
  if (pct >= 70) return "bg-[#FFCE00] text-black";
  if (pct >= 40) return "bg-gray-300 text-black";
  return "bg-orange-600 text-white";
}

const tooltipStyle = {
  borderRadius: "12px",
  border: "1px solid var(--color-border)",
  boxShadow: "var(--shadow-md)",
  fontFamily: "var(--font-body)",
  fontWeight: 600,
  fontSize: "13px",
  color: "var(--color-text-primary)",
};

export function CohortAnalyticsView({ companyId }: CohortAnalyticsViewProps) {
  const [entries, setEntries] = useState<CohortAnalyticsSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CohortAnalyticsDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId) {
      setEntries([]);
      setError("Select a company");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await getCohortAnalyticsOverview(companyId);
    if (result.error) setError(result.error);
    setEntries(result.entries ?? []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    setExpandedId(null);
    setDetail(null);
    void refresh();
  }, [refresh]);

  async function toggleRow(cohortId: string) {
    if (expandedId === cohortId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(cohortId);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    const result = await getCohortAnalyticsDetail(cohortId);
    if (result.error) setDetailError(result.error);
    setDetail(result.detail ?? null);
    setDetailLoading(false);
  }

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="space-y-1">
          <h2 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            Batches
          </h2>
          <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Compare engagement across every batch, then open a row for the full picture.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="btn btn--decline btn--sm"
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-lg)" }}>
        {loading ? (
          <div className="p-6 text-center text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
            Loading batches…
          </div>
        ) : error ? (
          <div className="p-6 text-center text-sm font-semibold" style={{ color: "var(--color-danger)" }}>
            {error}
          </div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-center text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
            No batches yet. Create one in Batch management.
          </div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse table-fixed min-w-[880px] text-xs">
              <thead>
                <tr style={{ background: "var(--color-bg-dark)", color: "var(--white)" }}>
                  <th className="px-3 py-3 font-semibold" style={{ borderRight: "1px solid rgba(255,255,255,0.08)" }}>
                    Batch
                  </th>
                  <th className="px-2 py-3 font-semibold text-center">Members</th>
                  <th className="px-2 py-3 font-semibold text-center">Action readers</th>
                  <th className="px-2 py-3 font-semibold text-center">Action takers</th>
                  <th className="px-2 py-3 font-semibold text-center">Consistently active</th>
                  <th className="px-2 py-3 font-semibold text-center">Commitment</th>
                  <th className="px-2 py-3 font-semibold text-center">Actions delivered</th>
                  <th className="px-2 py-3 font-semibold text-center">Avg / user</th>
                  <th className="px-2 py-3 font-semibold text-center" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const isOpen = expandedId === entry.cohortId;
                  return (
                    <Fragment key={entry.cohortId}>
                      <tr
                        className="cursor-pointer transition-colors"
                        style={{
                          borderBottom: "1px solid var(--color-border)",
                          background: isOpen ? "var(--color-bg-muted)" : "transparent",
                        }}
                        onClick={() => void toggleRow(entry.cohortId)}
                        onMouseEnter={(e) => {
                          if (!isOpen) (e.currentTarget as HTMLElement).style.background = "var(--color-bg-muted)";
                        }}
                        onMouseLeave={(e) => {
                          if (!isOpen) (e.currentTarget as HTMLElement).style.background = "transparent";
                        }}
                      >
                        <td className="px-3 py-2.5" style={{ borderRight: "1px solid var(--color-border)" }}>
                          <div className="flex items-center gap-2">
                            <span
                              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                              style={{ background: "var(--bright-amber)", color: "var(--shadow-grey)" }}
                            >
                              {initials(entry.batchName)}
                            </span>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                                {entry.batchName}
                              </div>
                              {entry.moduleName && (
                                <div className="text-[11px] truncate" style={{ color: "var(--color-text-muted)" }}>
                                  {entry.moduleName}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-center text-xs font-semibold">{entry.memberCount}</td>
                        <td className="px-2 py-2.5 text-center text-xs font-semibold text-blue-600">{entry.actionReadersPct}%</td>
                        <td className="px-2 py-2.5 text-center text-xs font-semibold text-green-600">{entry.actionTakersPct}%</td>
                        <td className="px-2 py-2.5 text-center text-xs font-semibold">{entry.consistentlyActivePct}%</td>
                        <td className="px-2 py-2.5 text-center text-xs font-semibold">
                          {entry.commitmentMaximum > 0 ? `${entry.commitmentPct}%` : "—"}
                        </td>
                        <td className="px-2 py-2.5 text-center text-xs font-semibold">{entry.totalActionsDelivered.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-center text-xs font-semibold">{entry.averageActionsPerUser}</td>
                        <td className="px-2 py-2.5 text-center">
                          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={9} className="p-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
                            <div className="p-4" style={{ background: "var(--color-bg-muted)" }}>
                              {detailLoading ? (
                                <div className="flex items-center gap-2 justify-center py-8 text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
                                  <Loader2 size={16} className="cohort-admin-spin" /> Loading batch detail…
                                </div>
                              ) : detailError ? (
                                <div className="text-center py-8 text-sm font-semibold" style={{ color: "var(--color-danger)" }}>
                                  {detailError}
                                </div>
                              ) : detail && detail.cohortId === entry.cohortId ? (
                                <CohortDrilldown detail={detail} />
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CohortDrilldown({ detail }: { detail: CohortAnalyticsDetail }) {
  const emptyState = (msg: string) => (
    <div className="h-full flex items-center justify-center text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
      {msg}
    </div>
  );

  const chartData = detail.weeklyChart.map((w) => ({
    name: w.name,
    weekRange: weekChartRange(w.weekStartIst, w.weekEndIst),
    Planned: w.planned,
    Validated: w.validated,
    Pending: w.pending,
    "Didn't complete": w.didntComplete,
  }));

  const barLabelStyle = { fontSize: 10, fontWeight: 700, fill: "var(--color-text-primary)" };
  const barLabel = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? String(value) : "";
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Members", value: detail.memberCount.toLocaleString() },
          { label: "Action readers", value: `${detail.actionReadersPct}%`, sub: `${detail.actionReadersCount} people` },
          { label: "Action takers", value: `${detail.actionTakersPct}%`, sub: `${detail.actionTakersCount} people` },
          { label: "Consistently active", value: `${detail.consistentlyActivePct}%` },
          {
            label: "Commitment score",
            value: detail.commitmentMaximum > 0 ? `${detail.commitmentPct}%` : "—",
            sub: detail.commitmentMaximum > 0 ? undefined : "No finalised plans yet",
          },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl p-3.5" style={{ border: "1px solid var(--color-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{card.label}</p>
            <p className="text-lg font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>{card.value}</p>
            {card.sub && <p className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{card.sub}</p>}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl p-4" style={{ border: "1px solid var(--color-border)" }}>
        <h4 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>Weekly actions</h4>
        <div className="h-[280px] w-full">
          {chartData.length === 0 ? emptyState("No delivery data yet") : (
            <ResponsiveContainer width="100%" height="100%">
              <ReBarChart data={chartData} barGap={3} barCategoryGap="22%" margin={{ top: 28, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--color-border)" />
                <XAxis
                  dataKey="name"
                  interval={0}
                  tick={makeWeekChartTick(chartData, { fill: "#8A8090", mutedFill: "#8A8090", fontSize: 11 })}
                  axisLine={{ stroke: "var(--color-border)", strokeWidth: 1 }}
                  tickLine={false}
                  height={52}
                />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 500, fill: "#8A8090" }} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={weekChartLabelFormatter(chartData)} />
                <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: "12px", fontSize: "12px", fontWeight: 600 }} />
                <Bar dataKey="Planned" fill="#3699FC" barSize={12} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="Planned" position="top" style={barLabelStyle} formatter={barLabel} />
                </Bar>
                <Bar dataKey="Validated" fill="#23CE6B" barSize={12} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="Validated" position="top" style={barLabelStyle} formatter={barLabel} />
                </Bar>
                <Bar dataKey="Pending" fill="#D97706" barSize={12} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="Pending" position="top" style={barLabelStyle} formatter={barLabel} />
                </Bar>
                <Bar dataKey="Didn't complete" fill="#EF4444" barSize={12} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="Didn't complete" position="top" style={barLabelStyle} formatter={barLabel} />
                </Bar>
              </ReBarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <h4 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Members</h4>
        </div>
        {detail.members.length === 0 ? (
          <div className="p-5 text-center text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>No members in this batch yet.</div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr style={{ background: "var(--color-bg-muted)" }}>
                  <th className="px-3 py-2 font-semibold" style={{ color: "var(--color-text-muted)" }}>Name</th>
                  <th className="px-2 py-2 font-semibold text-center" style={{ color: "var(--color-text-muted)" }}>Emails opened</th>
                  <th className="px-2 py-2 font-semibold text-center" style={{ color: "var(--color-text-muted)" }}>Planned actions</th>
                  <th className="px-2 py-2 font-semibold text-center" style={{ color: "var(--color-text-muted)" }}>Validated actions</th>
                  <th className="px-2 py-2 font-semibold text-center" style={{ color: "var(--color-text-muted)" }}>Pending validation</th>
                  <th className="px-2 py-2 font-semibold text-center" style={{ color: "var(--color-text-muted)" }}>Didn&apos;t complete</th>
                  <th className="px-2 py-2 font-semibold text-center" style={{ color: "var(--color-text-muted)" }}>Commitment</th>
                </tr>
              </thead>
              <tbody>
                {detail.members.map((member) => {
                  const hasPlan = member.commitmentMaximum > 0;
                  return (
                    <tr key={member.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                      <td className="px-3 py-2 font-semibold" style={{ color: "var(--color-text-primary)" }}>{member.name}</td>
                      <td className="px-2 py-2 text-center font-semibold" style={{ color: member.actionsReadCount > 0 ? "#3699FC" : "var(--color-text-muted)" }}>
                        {member.actionsReadCount}
                      </td>
                      <td className="px-2 py-2 text-center text-blue-600 font-semibold">{member.plannedActions}</td>
                      <td className="px-2 py-2 text-center text-green-600 font-semibold">{member.validatedCount}</td>
                      <td className="px-2 py-2 text-center font-semibold" style={{ color: member.pendingValidationCount > 0 ? "#D97706" : "var(--color-text-muted)" }}>
                        {member.pendingValidationCount}
                      </td>
                      <td className="px-2 py-2 text-center font-semibold" style={{ color: member.notCompletedCount > 0 ? "#EF4444" : "var(--color-text-muted)" }}>
                        {member.notCompletedCount}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${commitmentBadgeColor(member.commitmentPct, hasPlan)}`}>
                          {hasPlan ? `${member.commitmentPct}%` : "No plan"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
