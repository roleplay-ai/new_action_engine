"use client";

import { useState, useEffect } from "react";
import {
  BarChart as ReBarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
} from "recharts";
import { useAdminContext } from "@/components/admin/AdminContext";
import { makeWeekChartTick, weekChartLabelFormatter, weekChartRange } from "@/components/admin/WeekChartTick";
import {
  getActionCompletionWeeklyTrend,
  getCommitmentScoreBuckets,
  getDashboardLeaderboard,
  getBatchCommitmentWeeklyTrend,
  getEmailOpenRates,
  type ActionWeeklyTrendEntry,
  type CommitmentScoreBuckets,
  type DashboardLeaderboardEntry,
  type CommitmentWeeklyTrendEntry,
  type EmailOpenWeeklyEntry,
  type EmailEngagementTotals,
} from "@/app/actions/admin-dashboard";

interface DashboardViewProps {
  companyId: string | null;
}

export function DashboardView({ companyId }: DashboardViewProps) {
  const { selectedCohortId } = useAdminContext();
  // ── Batch/module drill-down (selector + buckets, leaderboard, weekly trend, email opens) ──
  const [actionWeeklyTrend, setActionWeeklyTrend] = useState<ActionWeeklyTrendEntry[]>([]);
  const [actionWeeklyLoading, setActionWeeklyLoading] = useState(false);
  const [scoreBuckets, setScoreBuckets] = useState<CommitmentScoreBuckets | null>(null);
  const [scoreBucketsLoading, setScoreBucketsLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState<DashboardLeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [weeklyTrend, setWeeklyTrend] = useState<CommitmentWeeklyTrendEntry[]>([]);
  const [weeklyTrendDelta, setWeeklyTrendDelta] = useState<number | null>(null);
  const [weeklyTrendLoading, setWeeklyTrendLoading] = useState(false);
  const [emailWeekly, setEmailWeekly] = useState<EmailOpenWeeklyEntry[]>([]);
  const [emailReminderTotals, setEmailReminderTotals] = useState<EmailEngagementTotals | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setActionWeeklyTrend([]);
      return;
    }
    setActionWeeklyLoading(true);
    getActionCompletionWeeklyTrend(companyId, selectedCohortId)
      .then(({ entries, error }) => setActionWeeklyTrend(!error ? entries ?? [] : []))
      .finally(() => setActionWeeklyLoading(false));
  }, [companyId, selectedCohortId]);

  useEffect(() => {
    if (!companyId) {
      setScoreBuckets(null);
      return;
    }
    setScoreBucketsLoading(true);
    getCommitmentScoreBuckets(companyId, selectedCohortId)
      .then(({ buckets, error }) => setScoreBuckets(!error ? buckets ?? null : null))
      .finally(() => setScoreBucketsLoading(false));
  }, [companyId, selectedCohortId]);

  useEffect(() => {
    if (!companyId) {
      setLeaderboard([]);
      return;
    }
    setLeaderboardLoading(true);
    getDashboardLeaderboard(companyId, selectedCohortId)
      .then(({ entries, error }) => setLeaderboard(!error ? entries ?? [] : []))
      .finally(() => setLeaderboardLoading(false));
  }, [companyId, selectedCohortId]);

  useEffect(() => {
    if (!companyId) {
      setWeeklyTrend([]);
      setWeeklyTrendDelta(null);
      return;
    }
    setWeeklyTrendLoading(true);
    getBatchCommitmentWeeklyTrend(companyId, selectedCohortId)
      .then(({ entries, deltaPct, error }) => {
        setWeeklyTrend(!error ? entries ?? [] : []);
        setWeeklyTrendDelta(!error ? deltaPct ?? null : null);
      })
      .finally(() => setWeeklyTrendLoading(false));
  }, [companyId, selectedCohortId]);

  useEffect(() => {
    if (!companyId) {
      setEmailWeekly([]);
      setEmailReminderTotals(null);
      return;
    }
    setEmailLoading(true);
    getEmailOpenRates(companyId, selectedCohortId)
      .then(({ weekly, reminderTotals, error }) => {
        setEmailWeekly(!error ? weekly ?? [] : []);
        setEmailReminderTotals(!error ? reminderTotals ?? null : null);
      })
      .finally(() => setEmailLoading(false));
  }, [companyId, selectedCohortId]);

  const tooltipStyle = {
    borderRadius: "12px",
    border: "1px solid var(--color-border)",
    boxShadow: "var(--shadow-md)",
    fontFamily: "var(--font-body)",
    fontWeight: 600,
    fontSize: "13px",
    color: "var(--color-text-primary)",
  };

  const barLabelStyle = { fontSize: 11, fontWeight: 700, fill: "var(--color-text-primary)" };
  const barLabel = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? String(value) : "";
  };

  const emptyState = (msg: string) => (
    <div className="h-full flex items-center justify-center text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
      {msg}
    </div>
  );

  const actionWeeklyChartData = actionWeeklyTrend.map((e) => ({
    name: `Week ${e.weekNumber}`,
    weekRange: weekChartRange(e.weekStartIst, e.weekEndIst),
    "Actions due": e.due,
    "Actions completed": e.completed,
  }));

  const scoreBucketChartData = scoreBuckets
    ? [
      { name: "Below 50%", Users: scoreBuckets.belowBand50, color: "#ED4551" },
      { name: "50–74%", Users: scoreBuckets.band50to74, color: "#FFCE00" },
      { name: "75–89%", Users: scoreBuckets.band75to89, color: "#3699FC" },
      { name: "90–100%", Users: scoreBuckets.band90to100, color: "#8B5CF6" },
    ]
    : [];

  const weeklyTrendChartData = weeklyTrend.map((e) => ({
    name: `Week ${e.weekNumber}`,
    weekRange: weekChartRange(e.weekStartIst, e.weekEndIst),
    "Avg. commitment %": e.avgCommitmentPct,
  }));

  const emailOpenChartData = emailWeekly.map((e) => ({
    name: `Week ${e.weekNumber}`,
    weekRange: weekChartRange(e.weekStartIst, e.weekEndIst),
    "Reminder open %": e.reminderOpenRate,
  }));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">

      {/* ── PAGE HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="space-y-1">
          <h2 className="text-2xl lg:text-3xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            Dashboard
          </h2>
          <p className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
            Real-time organizational behavior insights
          </p>
        </div>
      </div>

      {/* ── BATCH DRILL-DOWN ── */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
              Batch &amp; Module Drill-down
            </h3>
            <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
              Defaults to the current batch. Switch above to another batch, or &quot;All batches&quot; for the consolidated view.
            </p>
          </div>
          {/* Users who've finalised an action plan — same "made a plan" signal as the
              Leaderboard's "No plan" tag (commitmentMaximum > 0), so the two numbers agree.
              Batch avg sits beside it (mean among activated users only). */}
          <div className="flex flex-wrap items-stretch gap-2.5 shrink-0">
            <div
              className="bg-white rounded-xl px-4 py-2.5 flex flex-col justify-center gap-0.5 min-w-[148px]"
              style={{
                border: "1px solid rgba(54, 153, 252, 0.45)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                Activated action plan
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold leading-none" style={{ color: "#3699FC" }}>
                  {scoreBucketsLoading ? "…" : scoreBuckets ? scoreBuckets.totalUsers - scoreBuckets.notStarted : 0}
                </span>
                <span className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
                  of {scoreBucketsLoading ? "…" : scoreBuckets?.totalUsers ?? 0}
                </span>
              </span>
            </div>
            <div
              className="bg-white rounded-xl px-4 py-2.5 flex flex-col justify-center gap-0.5 min-w-[148px]"
              style={{
                border: "1px solid rgba(35, 206, 107, 0.45)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                Batch avg commitment
              </span>
              <span className="text-3xl font-bold leading-none" style={{ color: "#16A34A" }}>
                {scoreBucketsLoading
                  ? "…"
                  : scoreBuckets?.avgCommitmentPct != null
                    ? `${scoreBuckets.avgCommitmentPct}%`
                    : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Weekly Action Completion (due vs. completed, left) + Commitment Score Distribution (bar, right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Weekly Action Completion */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                Weekly Action Completion
              </h4>
              <span className="tag tag--yellow">Actions due vs. completed, per week</span>
            </div>
            <div className="bg-white rounded-2xl p-4 overflow-visible" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-md)", height: 336 }}>
              {actionWeeklyLoading ? (
                emptyState("Loading…")
              ) : actionWeeklyChartData.length === 0 ? (
                emptyState("No scheduled actions in scope yet")
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ReBarChart data={actionWeeklyChartData} margin={{ top: 32, right: 12, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                    <XAxis
                      dataKey="name"
                      interval={0}
                      tick={makeWeekChartTick(actionWeeklyChartData)}
                      tickMargin={4}
                      height={56}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={48} label={{ value: "Actions", angle: -90, position: "insideLeft", offset: 8, fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={weekChartLabelFormatter(actionWeeklyChartData)} />
                    <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingBottom: 8 }} />
                    <Bar dataKey="Actions due" fill="#3699FC" radius={[6, 6, 0, 0]}>
                      <LabelList dataKey="Actions due" position="top" style={barLabelStyle} formatter={barLabel} />
                    </Bar>
                    <Bar dataKey="Actions completed" fill="#23CE6B" radius={[6, 6, 0, 0]}>
                      <LabelList dataKey="Actions completed" position="top" style={barLabelStyle} formatter={barLabel} />
                    </Bar>
                  </ReBarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Commitment Score Distribution */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                Commitment Score Distribution
              </h4>
              {scoreBuckets && scoreBuckets.notStarted > 0 && (
                <span className="tag tag--yellow">{scoreBuckets.notStarted} not started (no plan yet)</span>
              )}
            </div>
            <div className="bg-white rounded-2xl p-4 overflow-visible" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-md)", height: 320 }}>
              {scoreBucketsLoading ? (
                emptyState("Loading…")
              ) : !scoreBuckets || scoreBuckets.totalUsers === 0 ? (
                emptyState("No commitment data yet")
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ReBarChart data={scoreBucketChartData} margin={{ top: 32, right: 12, left: 8, bottom: 28 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} tickMargin={8} height={48} label={{ value: "Commitment score band", position: "insideBottom", offset: -16, fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={48} label={{ value: "Users", angle: -90, position: "insideLeft", offset: 8, fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="Users" radius={[6, 6, 0, 0]}>
                      {scoreBucketChartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                      <LabelList dataKey="Users" position="top" style={barLabelStyle} formatter={barLabel} />
                    </Bar>
                  </ReBarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Leaderboard */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
              Leaderboard
            </h4>
            <span className="tag tag--yellow">Ranked by commitment score %</span>
          </div>
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-lg)" }}>
            {leaderboardLoading ? (
              <div className="p-6 text-center text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>Loading leaderboard…</div>
            ) : leaderboard.length === 0 ? (
              <div className="p-6 text-center text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>No members in scope yet</div>
            ) : (
              <div className="overflow-x-auto no-scrollbar max-h-96 overflow-y-auto">
                <table className="w-full text-left border-collapse table-fixed min-w-[880px] text-xs">
                  <thead>
                    <tr style={{ background: "var(--color-bg-dark)", color: "var(--white)" }}>
                      <th className="px-3 py-3 text-xs font-semibold" style={{ borderRight: "1px solid rgba(255,255,255,0.08)", width: "34%" }}>Rank / Name</th>
                      <th className="px-2 py-3 text-xs font-semibold text-center" style={{ width: "11%" }}>Planned actions</th>
                      <th className="px-2 py-3 text-xs font-semibold text-center" style={{ width: "11%" }}>Actions sent</th>
                      <th className="px-2 py-3 text-xs font-semibold text-center" style={{ width: "11%" }}>Validated actions</th>
                      <th className="px-2 py-3 text-xs font-semibold text-center" style={{ width: "11%" }}>Didn&apos;t complete</th>
                      <th className="px-2 py-3 text-xs font-semibold text-center" style={{ width: "11%" }}>Archived</th>
                      <th className="px-2 py-3 text-xs font-semibold text-center" style={{ width: "11%" }}>Commitment score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((user, index) => (
                      <tr key={user.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td className="px-3 py-2.5" style={{ borderRight: "1px solid var(--color-border)" }}>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium italic" style={{ color: "var(--color-text-muted)" }}>#{index + 1}</span>
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: "var(--bright-amber)", color: "var(--shadow-grey)" }}>
                              {user.name.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="text-xs font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{user.name}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-center text-blue-600 font-semibold">{user.plannedActions}</td>
                        <td className="px-2 py-2.5 text-center font-semibold" style={{ color: user.actionsSentCount > 0 ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
                          {user.actionsSentCount}
                        </td>
                        <td className="px-2 py-2.5 text-center text-green-600 font-semibold">{user.validatedCount}</td>
                        <td className="px-2 py-2.5 text-center font-semibold" style={{ color: user.notCompletedCount > 0 ? "#EF4444" : "var(--color-text-muted)" }}>
                          {user.notCompletedCount}
                        </td>
                        <td className="px-2 py-2.5 text-center font-semibold" style={{ color: user.pendingValidationCount > 0 ? "#D97706" : "var(--color-text-muted)" }}>
                          {user.pendingValidationCount}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span className="text-xs font-semibold">{user.commitmentMaximum > 0 ? `${user.commitmentPct}%` : "No plan"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Batch Commitment Score: average + weekly trend + WoW delta */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
              Batch Commitment Score
            </h4>
            {weeklyTrendDelta !== null && (
              <span
                className="text-xs font-semibold px-2 py-1 rounded-full"
                style={{
                  background: weeklyTrendDelta >= 0 ? "rgba(35,206,107,0.12)" : "rgba(237,69,81,0.12)",
                  color: weeklyTrendDelta >= 0 ? "#16a34a" : "#dc2626",
                }}
              >
                {weeklyTrendDelta >= 0 ? "▲" : "▼"} {Math.abs(weeklyTrendDelta)} pts vs. last week
              </span>
            )}
          </div>
          <div className="bg-white rounded-2xl p-4 overflow-visible" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-md)", height: 316 }}>
            {weeklyTrendLoading ? (
              emptyState("Loading…")
            ) : weeklyTrend.length === 0 ? (
              emptyState("No finalised plans yet")
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ReBarChart data={weeklyTrendChartData} margin={{ top: 32, right: 12, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                  <XAxis
                    dataKey="name"
                    interval={0}
                    tick={makeWeekChartTick(weeklyTrendChartData)}
                    tickMargin={4}
                    height={56}
                  />
                  <YAxis domain={[0, 110]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 12 }} width={48} label={{ value: "Avg. commitment %", angle: -90, position: "insideLeft", offset: 8, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={weekChartLabelFormatter(weeklyTrendChartData)} />
                  <Bar dataKey="Avg. commitment %" fill="#3699FC" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="Avg. commitment %" position="top" style={barLabelStyle} formatter={barLabel} />
                  </Bar>
                </ReBarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Email Engagement: open rate */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
              Email Engagement
            </h4>
            <span className="tag tag--yellow">Reminder Emails · Open Rate</span>
          </div>

          <div className="bg-white rounded-xl p-4 flex flex-col gap-2 max-w-sm" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-sm)" }}>
            <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Reminder — open rate</span>
            <span className="text-2xl font-bold leading-none" style={{ color: "#23CE6B" }}>
              {emailLoading ? "…" : `${emailReminderTotals?.openRate ?? 0}%`}
            </span>
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {emailReminderTotals
                ? `${emailReminderTotals.opened} opened of ${emailReminderTotals.sent} sent`
                : "No sends yet"}
            </span>
          </div>

          <div className="bg-white rounded-2xl p-4 overflow-visible" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-md)", height: 336 }}>
            {emailLoading ? (
              emptyState("Loading…")
            ) : emailOpenChartData.length === 0 ? (
              emptyState("No week-attributed sends yet")
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ReBarChart data={emailOpenChartData} margin={{ top: 32, right: 12, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                  <XAxis
                    dataKey="name"
                    interval={0}
                    tick={makeWeekChartTick(emailOpenChartData)}
                    tickMargin={4}
                    height={56}
                  />
                  <YAxis domain={[0, 110]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 12 }} width={48} label={{ value: "Open rate %", angle: -90, position: "insideLeft", offset: 8, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={weekChartLabelFormatter(emailOpenChartData)} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingBottom: 8 }} />
                  <Bar dataKey="Reminder open %" fill="#23CE6B" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="Reminder open %" position="top" style={barLabelStyle} formatter={barLabel} />
                  </Bar>
                </ReBarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
