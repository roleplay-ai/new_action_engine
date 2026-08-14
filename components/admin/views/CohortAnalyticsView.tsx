"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Flame, Loader2 } from "lucide-react";
import {
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  getCohortAnalyticsOverview,
  getCohortAnalyticsDetail,
  type CohortAnalyticsSummary,
  type CohortAnalyticsDetail,
} from "@/app/actions/admin-analytics";
import { League } from "@/lib/types";

interface CohortAnalyticsViewProps {
  companyId: string | null;
}

function initials(value: string) {
  const words = value.trim().split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase()).join("") || "C";
}

function leagueBadgeColor(league: League) {
  switch (league) {
    case League.Diamond:
      return "bg-purple-600 text-white";
    case League.Gold:
      return "bg-[#FFCE00] text-black";
    case League.Silver:
      return "bg-gray-300 text-black";
    case League.Bronze:
      return "bg-orange-600 text-white";
    default:
      return "bg-gray-100 text-gray-400";
  }
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
            Cohorts
          </h2>
          <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Compare engagement across every cohort, then open a row for the full picture.
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
            Loading cohorts…
          </div>
        ) : error ? (
          <div className="p-6 text-center text-sm font-semibold" style={{ color: "var(--color-danger)" }}>
            {error}
          </div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-center text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
            No cohorts yet. Create one in Cohort management.
          </div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse table-fixed min-w-[880px] text-xs">
              <thead>
                <tr style={{ background: "var(--color-bg-dark)", color: "var(--white)" }}>
                  <th className="px-3 py-3 font-semibold" style={{ borderRight: "1px solid rgba(255,255,255,0.08)" }}>
                    Cohort
                  </th>
                  <th className="px-2 py-3 font-semibold text-center">Members</th>
                  <th className="px-2 py-3 font-semibold text-center">Action readers</th>
                  <th className="px-2 py-3 font-semibold text-center">Action takers</th>
                  <th className="px-2 py-3 font-semibold text-center">Consistently active</th>
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
                        <td className="px-2 py-2.5 text-center text-xs font-semibold">{entry.totalActionsDelivered.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-center text-xs font-semibold">{entry.averageActionsPerUser}</td>
                        <td className="px-2 py-2.5 text-center">
                          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={8} className="p-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
                            <div className="p-4" style={{ background: "var(--color-bg-muted)" }}>
                              {detailLoading ? (
                                <div className="flex items-center gap-2 justify-center py-8 text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
                                  <Loader2 size={16} className="cohort-admin-spin" /> Loading cohort detail…
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

  const chartData = detail.weeklyChart.map((w) => ({ name: w.name, Accepted: w.accepted, Skipped: w.skipped, Successful: w.successful }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Members", value: detail.memberCount.toLocaleString() },
          { label: "Action readers", value: `${detail.actionReadersPct}%`, sub: `${detail.actionReadersCount} people` },
          { label: "Action takers", value: `${detail.actionTakersPct}%`, sub: `${detail.actionTakersCount} people` },
          { label: "Consistently active", value: `${detail.consistentlyActivePct}%` },
          { label: "Combined points", value: detail.totalPoints.toLocaleString() },
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
        <div className="h-[220px] w-full">
          {chartData.length === 0 ? emptyState("No delivery data yet") : (
            <ResponsiveContainer width="100%" height="100%">
              <ReBarChart data={chartData} barGap={3} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 500, fill: "#8A8090" }} axisLine={{ stroke: "var(--color-border)", strokeWidth: 1 }} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 500, fill: "#8A8090" }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: "12px", fontSize: "12px", fontWeight: 600 }} />
                <Bar dataKey="Accepted" fill="#23CE6B" barSize={10} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Skipped" fill="#FFCE00" barSize={10} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Successful" fill="#3699FC" barSize={10} radius={[4, 4, 0, 0]} />
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
          <div className="p-5 text-center text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>No members in this cohort yet.</div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr style={{ background: "var(--color-bg-muted)" }}>
                  <th className="px-3 py-2 font-semibold" style={{ color: "var(--color-text-muted)" }}>Name</th>
                  <th className="px-2 py-2 font-semibold text-center" style={{ color: "var(--color-text-muted)" }}>Accepted</th>
                  <th className="px-2 py-2 font-semibold text-center" style={{ color: "var(--color-text-muted)" }}>Validated</th>
                  <th className="px-2 py-2 font-semibold text-center" style={{ color: "var(--color-text-muted)" }}>Streak</th>
                  <th className="px-2 py-2 font-semibold text-center" style={{ color: "var(--color-text-muted)" }}>League / Pts</th>
                </tr>
              </thead>
              <tbody>
                {detail.members.map((member) => (
                  <tr key={member.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td className="px-3 py-2 font-semibold" style={{ color: "var(--color-text-primary)" }}>{member.name}</td>
                    <td className="px-2 py-2 text-center text-blue-600 font-semibold">{member.acceptedCount}</td>
                    <td className="px-2 py-2 text-center text-green-600 font-semibold">{member.validatedCount}</td>
                    <td className="px-2 py-2 text-center">
                      <span className="inline-flex items-center gap-1 justify-center">
                        <Flame size={11} className={member.streak > 0 ? "text-orange-500 fill-current" : "text-gray-300"} />
                        {member.streak}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${leagueBadgeColor(member.league)}`}>{member.league}</span>
                        <span className="text-[10px] font-semibold">{member.totalPoints}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
