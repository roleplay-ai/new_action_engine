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
  PieChart,
  Pie,
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
  const { selectedCohortId, setViewReady } = useAdminContext();
  // ── Batch/module drill-down (selector + buckets, leaderboard, weekly trend, email opens) ──
  const [actionWeeklyTrend, setActionWeeklyTrend] = useState<ActionWeeklyTrendEntry[]>([]);
  const [actionWeeklyLoading, setActionWeeklyLoading] = useState(true);
  const [scoreBuckets, setScoreBuckets] = useState<CommitmentScoreBuckets | null>(null);
  const [scoreBucketsLoading, setScoreBucketsLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<DashboardLeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [weeklyTrend, setWeeklyTrend] = useState<CommitmentWeeklyTrendEntry[]>([]);
  const [weeklyTrendDelta, setWeeklyTrendDelta] = useState<number | null>(null);
  const [weeklyTrendLoading, setWeeklyTrendLoading] = useState(true);
  const [emailWeekly, setEmailWeekly] = useState<EmailOpenWeeklyEntry[]>([]);
  const [emailReminderTotals, setEmailReminderTotals] = useState<EmailEngagementTotals | null>(null);
  const [emailRecapTotals, setEmailRecapTotals] = useState<EmailEngagementTotals | null>(null);
  const [emailEitherTotals, setEmailEitherTotals] = useState<EmailEngagementTotals | null>(null);
  const [emailLoading, setEmailLoading] = useState(true);

  // All five sections fetch independently; rather than letting each one pop
  // in on its own timeline, report readiness up to BatchPickerGate once every
  // section has settled at least once for this company/cohort, so its
  // loading screen — not an assumption that picking a batch means the data
  // is there — is what decides when the dashboard actually shows.
  const dashboardReady = !actionWeeklyLoading && !scoreBucketsLoading && !leaderboardLoading && !weeklyTrendLoading && !emailLoading;

  useEffect(() => {
    setViewReady(dashboardReady);
  }, [dashboardReady, setViewReady]);

  useEffect(() => () => setViewReady(true), [setViewReady]);

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
      setEmailRecapTotals(null);
      setEmailEitherTotals(null);
      return;
    }
    setEmailLoading(true);
    getEmailOpenRates(companyId, selectedCohortId)
      .then(({ weekly, reminderTotals, recapTotals, eitherTotals, error }) => {
        setEmailWeekly(!error ? weekly ?? [] : []);
        setEmailReminderTotals(!error ? reminderTotals ?? null : null);
        setEmailRecapTotals(!error ? recapTotals ?? null : null);
        setEmailEitherTotals(!error ? eitherTotals ?? null : null);
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

  const emailCombinedChartData = emailWeekly.map((e) => ({
    name: `Week ${e.weekNumber}`,
    weekRange: weekChartRange(e.weekStartIst, e.weekEndIst),
    "Reminder sent": e.reminderSent,
    "Reminder opened": e.reminderOpenedUsers,
    "Weekly recap sent": e.recapSent,
    "Weekly recap opened": e.recapOpenedUsers,
    "Either mail opened": e.eitherMailOpenedUsers,
  }));

  // Derive summary cards from the same week rows as the charts so the headline
  // % always matches what the bars aggregate (not a separate diluted total).
  const reminderCardStats = (() => {
    const sent = emailWeekly.reduce((sum, e) => sum + e.reminderSent, 0);
    const opened = emailWeekly.reduce((sum, e) => sum + e.reminderOpened, 0);
    return {
      sent,
      opened,
      openedUsers: emailReminderTotals?.openedUsers ?? 0,
      openRate: sent > 0 ? Math.round((opened * 100) / sent) : (emailReminderTotals?.openRate ?? 0),
    };
  })();
  const recapCardStats = (() => {
    const sent = emailWeekly.reduce((sum, e) => sum + e.recapSent, 0);
    const opened = emailWeekly.reduce((sum, e) => sum + e.recapOpened, 0);
    return {
      sent,
      opened,
      openedUsers: emailRecapTotals?.openedUsers ?? 0,
      openRate: sent > 0 ? Math.round((opened * 100) / sent) : (emailRecapTotals?.openRate ?? 0),
    };
  })();
  const eitherCardStats = (() => {
    const sent = reminderCardStats.sent + recapCardStats.sent;
    const opened = reminderCardStats.opened + recapCardStats.opened;
    return {
      sent,
      opened,
      openedUsers: emailEitherTotals?.openedUsers ?? 0,
      openRate: sent > 0 ? Math.round((opened * 100) / sent) : (emailEitherTotals?.openRate ?? 0),
    };
  })();
  // Weekly average of unique "either mail" openers/reach, for the "avg of users who
  // open either mail" stat card — averaged per week rather than a lifetime union.
  const eitherWeeklyAvgStats = (() => {
    if (emailWeekly.length === 0) return { avgOpenedUsers: 0, avgReachUsers: 0 };
    const totalOpened = emailWeekly.reduce((sum, e) => sum + e.eitherMailOpenedUsers, 0);
    const totalReach = emailWeekly.reduce((sum, e) => sum + e.eitherMailUsers, 0);
    return {
      avgOpenedUsers: Math.round(totalOpened / emailWeekly.length),
      avgReachUsers: Math.round(totalReach / emailWeekly.length),
    };
  })();

  // Of users who've activated a plan (commitmentMaximum > 0, same signal as the
  // "Activated action plan" card), how many have validated at least one action.
  const validationRateStats = (() => {
    const planned = leaderboard.filter((u) => u.commitmentMaximum > 0);
    const validatedAtLeastOne = planned.filter((u) => u.validatedCount > 0).length;
    return {
      plannedCount: planned.length,
      validatedAtLeastOne,
      pct: planned.length > 0 ? Math.round((validatedAtLeastOne * 100) / planned.length) : 0,
    };
  })();

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
        {/* Users who've finalised an action plan — same "made a plan" signal as the
            Leaderboard's "No plan" tag (commitmentMaximum > 0), so the two numbers agree.
            Batch avg sits beside it (mean among activated users only). */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          <div
            className="bg-white rounded-2xl px-6 py-5 flex flex-col justify-center gap-1"
            style={{
              border: "1px solid rgba(54, 153, 252, 0.45)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Activated action plan
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-4xl font-bold leading-none" style={{ color: "#3699FC" }}>
                {scoreBucketsLoading ? "…" : scoreBuckets ? scoreBuckets.totalUsers - scoreBuckets.notStarted : 0}
              </span>
              <span className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
                of {scoreBucketsLoading ? "…" : scoreBuckets?.totalUsers ?? 0}
              </span>
            </span>
          </div>
          <div
            className="bg-white rounded-2xl px-6 py-5 flex flex-col justify-center gap-1"
            style={{
              border: "1px solid rgba(35, 206, 107, 0.45)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Batch avg commitment
            </span>
            <span className="text-4xl font-bold leading-none" style={{ color: "#16A34A" }}>
              {scoreBucketsLoading
                ? "…"
                : scoreBuckets?.avgCommitmentPct != null
                  ? `${scoreBuckets.avgCommitmentPct}%`
                  : "—"}
            </span>
          </div>
          <div
            className="bg-white rounded-2xl px-6 py-5 flex flex-col justify-center gap-1"
            style={{
              border: "1px solid rgba(139, 92, 246, 0.45)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Total actions validated
            </span>
            <span className="text-4xl font-bold leading-none" style={{ color: "#8B5CF6" }}>
              {leaderboardLoading ? "…" : leaderboard.reduce((sum, u) => sum + u.validatedCount, 0)}
            </span>
          </div>
          <div
            className="bg-white rounded-2xl px-6 py-5 flex flex-col justify-center gap-1"
            style={{
              border: "1px solid rgba(29, 78, 216, 0.45)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Avg. users who opened either mail / week
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-4xl font-bold leading-none" style={{ color: "#1D4ED8" }}>
                {emailLoading ? "…" : eitherWeeklyAvgStats.avgOpenedUsers}
              </span>
              <span className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
                of {emailLoading ? "…" : eitherWeeklyAvgStats.avgReachUsers}
              </span>
            </span>
          </div>
          <div
            className="bg-white rounded-2xl px-6 py-5 flex flex-col justify-center gap-1"
            style={{
              border: "1px solid rgba(35, 206, 107, 0.45)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Validated atleast 1 action
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-4xl font-bold leading-none" style={{ color: "#16A34A" }}>
                {leaderboardLoading ? "…" : `${validationRateStats.pct}%`}
              </span>
              <span className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
                {leaderboardLoading ? "…" : `${validationRateStats.validatedAtLeastOne} of ${validationRateStats.plannedCount}`}
              </span>
            </span>
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
            <div className="bg-white rounded-2xl p-4 overflow-visible" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-md)", height: 360 }}>
              {scoreBucketsLoading ? (
                emptyState("Loading…")
              ) : !scoreBuckets || scoreBuckets.totalUsers === 0 ? (
                emptyState("No commitment data yet")
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 16, right: 48, left: 48, bottom: 8 }}>
                    <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [`${value} users`, name]} />
                    <Legend
                      verticalAlign="bottom"
                      wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingTop: 8 }}
                      formatter={(value) => <span style={{ color: "var(--color-text-secondary)" }}>{value}</span>}
                    />
                    <Pie
                      data={scoreBucketChartData}
                      dataKey="Users"
                      nameKey="name"
                      cx="50%"
                      cy="46%"
                      outerRadius="60%"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {scoreBucketChartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
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
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-left border-collapse table-fixed min-w-[1180px] text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr style={{ background: "var(--color-bg-dark)", color: "var(--white)" }}>
                      <th className="px-3 py-3 text-xs font-semibold" style={{ borderRight: "1px solid rgba(255,255,255,0.08)", width: "24%" }}>Rank / Name</th>
                      <th className="px-2 py-3 text-xs font-semibold" style={{ borderRight: "1px solid rgba(255,255,255,0.08)", width: "12%" }}>Buddy</th>
                      <th className="px-2 py-3 text-xs font-semibold text-center" style={{ width: "8%" }}>Either mail opened</th>
                      <th className="px-2 py-3 text-xs font-semibold text-center" style={{ width: "8%" }}>Planned actions</th>
                      <th className="px-2 py-3 text-xs font-semibold text-center" style={{ width: "8%" }}>Actions sent</th>
                      <th className="px-2 py-3 text-xs font-semibold text-center" style={{ width: "8%" }}>Validated actions</th>
                      <th className="px-2 py-3 text-xs font-semibold text-center" style={{ width: "8%" }}>Current actions left</th>
                      <th className="px-2 py-3 text-xs font-semibold text-center" style={{ width: "8%" }}>Didn&apos;t complete</th>
                      <th className="px-2 py-3 text-xs font-semibold text-center" style={{ width: "9%" }}>Pending validation</th>
                      <th className="px-2 py-3 text-xs font-semibold text-center" style={{ width: "10%" }}>Commitment score</th>
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
                        <td className="px-2 py-2.5" style={{ borderRight: "1px solid var(--color-border)" }}>
                          <span className="text-xs font-medium truncate block" style={{ color: "var(--color-text-muted)" }}>
                            {user.buddyName ?? "—"}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-center font-semibold" style={{ color: user.actionsReadCount > 0 ? "#3699FC" : "var(--color-text-muted)" }}>
                          {user.actionsReadCount}
                        </td>
                        <td className="px-2 py-2.5 text-center text-blue-600 font-semibold">{user.plannedActions}</td>
                        <td className="px-2 py-2.5 text-center font-semibold" style={{ color: user.actionsSentCount > 0 ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
                          {user.actionsSentCount}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span
                            className={`tag ${user.validatedCount > 0 ? "tag--teal" : ""}`}
                            style={
                              user.validatedCount === 0
                                ? { background: "var(--color-tag-red-bg, rgba(237, 69, 81, 0.12))", color: "var(--color-tag-red-text, #8C1C24)" }
                                : undefined
                            }
                          >
                            {user.validatedCount}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-center font-semibold" style={{ color: user.currentCount > 0 ? "#3699FC" : "var(--color-text-muted)" }}>
                          {user.currentCount}
                        </td>
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

        {/* Email Engagement: stats + combined unique-user opens chart */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
              Email Engagement
            </h4>
            <span className="tag tag--yellow">Either · Reminder · Friday Weekly Recap</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

            {/* <div className="bg-white rounded-xl p-4 flex flex-col gap-2" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-sm)" }}>
              <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Reminder — open rate</span>
              <span className="text-2xl font-bold leading-none" style={{ color: "#23CE6B" }}>
                {emailLoading ? "…" : `${reminderCardStats.openRate}%`}
              </span>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {reminderCardStats.sent > 0 || emailReminderTotals
                  ? `${reminderCardStats.opened} opened of ${reminderCardStats.sent} sent · ${reminderCardStats.openedUsers} users opened`
                  : "No sends yet"}
              </span>
            </div> */}
            {/* <div className="bg-white rounded-xl p-4 flex flex-col gap-2" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-sm)" }}>
              <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Friday weekly recap — open rate</span>
              <span className="text-2xl font-bold leading-none" style={{ color: "#8B5CF6" }}>
                {emailLoading ? "…" : `${recapCardStats.openRate}%`}
              </span>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {recapCardStats.sent > 0 || emailRecapTotals
                  ? `${recapCardStats.opened} opened of ${recapCardStats.sent} sent · ${recapCardStats.openedUsers} users opened`
                  : "No sends yet"}
              </span>
            </div> */}
          </div>

          <div className="bg-white rounded-2xl p-4 overflow-visible" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-md)", height: 400 }}>
            {emailLoading ? (
              emptyState("Loading…")
            ) : emailCombinedChartData.length === 0 ? (
              emptyState("No week-attributed sends yet")
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ReBarChart data={emailCombinedChartData} barGap={4} barCategoryGap="28%" maxBarSize={18} margin={{ top: 60, right: 12, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                  <XAxis
                    dataKey="name"
                    interval={0}
                    tick={makeWeekChartTick(emailCombinedChartData)}
                    tickMargin={4}
                    height={56}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={48} label={{ value: "Users", angle: -90, position: "insideLeft", offset: 8, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={weekChartLabelFormatter(emailCombinedChartData)} />
                  <Legend
                    verticalAlign="top"
                    wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingBottom: 24 }}
                    formatter={(value) => <span style={{ color: "var(--color-text-secondary)" }}>{value}</span>}
                  />
                  <Bar dataKey="Reminder sent" fill="#BBE8D0" radius={[4, 4, 0, 0]} maxBarSize={16}>
                    <LabelList dataKey="Reminder sent" position="top" offset={6} style={barLabelStyle} formatter={barLabel} />
                  </Bar>
                  <Bar dataKey="Reminder opened" fill="#23CE6B" radius={[4, 4, 0, 0]} maxBarSize={16}>
                    <LabelList dataKey="Reminder opened" position="top" offset={6} style={barLabelStyle} formatter={barLabel} />
                  </Bar>
                  <Bar dataKey="Weekly recap sent" fill="#DDD6FE" radius={[4, 4, 0, 0]} maxBarSize={16}>
                    <LabelList dataKey="Weekly recap sent" position="top" offset={6} style={barLabelStyle} formatter={barLabel} />
                  </Bar>
                  <Bar dataKey="Weekly recap opened" fill="#8B5CF6" radius={[4, 4, 0, 0]} maxBarSize={16}>
                    <LabelList dataKey="Weekly recap opened" position="top" offset={6} style={barLabelStyle} formatter={barLabel} />
                  </Bar>
                  <Bar dataKey="Either mail opened" fill="#1D4ED8" radius={[6, 6, 0, 0]} maxBarSize={40}>
                    <LabelList dataKey="Either mail opened" position="top" offset={6} style={{ ...barLabelStyle, fontWeight: 700 }} formatter={barLabel} />
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
