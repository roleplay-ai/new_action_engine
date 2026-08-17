"use client";

import { useState, useEffect } from "react";
import {
  BarChart as ReBarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useAdminContext } from "@/components/admin/AdminContext";
import {
  getActionCompletionBuckets,
  getCommitmentScoreBuckets,
  getDashboardLeaderboard,
  getBatchCommitmentWeeklyTrend,
  getEmailOpenRates,
  type ActionCompletionBuckets,
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
  const [completionBuckets, setCompletionBuckets] = useState<ActionCompletionBuckets | null>(null);
  const [completionLoading, setCompletionLoading] = useState(false);
  const [scoreBuckets, setScoreBuckets] = useState<CommitmentScoreBuckets | null>(null);
  const [scoreBucketsLoading, setScoreBucketsLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState<DashboardLeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [weeklyTrend, setWeeklyTrend] = useState<CommitmentWeeklyTrendEntry[]>([]);
  const [weeklyTrendDelta, setWeeklyTrendDelta] = useState<number | null>(null);
  const [weeklyTrendLoading, setWeeklyTrendLoading] = useState(false);
  const [emailWeekly, setEmailWeekly] = useState<EmailOpenWeeklyEntry[]>([]);
  const [emailReminderTotals, setEmailReminderTotals] = useState<EmailEngagementTotals | null>(null);
  const [emailWebhookConfigured, setEmailWebhookConfigured] = useState(true);
  const [emailLoading, setEmailLoading] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setCompletionBuckets(null);
      return;
    }
    setCompletionLoading(true);
    getActionCompletionBuckets(companyId, selectedCohortId)
      .then(({ buckets, error }) => setCompletionBuckets(!error ? buckets ?? null : null))
      .finally(() => setCompletionLoading(false));
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
      .then(({ weekly, reminderTotals, webhookConfigured, error }) => {
        setEmailWeekly(!error ? weekly ?? [] : []);
        setEmailReminderTotals(!error ? reminderTotals ?? null : null);
        setEmailWebhookConfigured(webhookConfigured ?? true);
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

  const emptyState = (msg: string) => (
    <div className="h-full flex items-center justify-center text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
      {msg}
    </div>
  );

  const completionTiles = completionBuckets
    ? [
      { label: "Inactive (0%)", value: completionBuckets.inactive, color: "#ED4551" },
      { label: "Less than 25%", value: completionBuckets.lessThan25, color: "#F97316" },
      { label: "25% – 50%", value: completionBuckets.between25And50, color: "#FFCE00" },
      { label: "More than 50%", value: completionBuckets.moreThan50, color: "#23CE6B" },
    ]
    : [];

  const scoreBucketChartData = scoreBuckets
    ? [
      { name: "90–100", Users: scoreBuckets.band90to100, color: "#8B5CF6" },
      { name: "75–89", Users: scoreBuckets.band75to89, color: "#3699FC" },
      { name: "50–74", Users: scoreBuckets.band50to74, color: "#FFCE00" },
      { name: "Below 50", Users: scoreBuckets.belowBand50, color: "#ED4551" },
    ]
    : [];

  const weeklyTrendChartData = weeklyTrend.map((e) => ({ name: `Week ${e.weekNumber}`, "Avg. commitment %": e.avgCommitmentPct }));

  const emailOpenChartData = emailWeekly.map((e) => ({
    name: `Week ${e.weekNumber}`,
    "Reminder open %": e.reminderOpenRate,
    "Reminder click %": e.reminderClickRate,
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
              Use the batch selector above to focus on one batch, or leave on &quot;All batches&quot; for the consolidated view.
            </p>
          </div>
        </div>

        {/* Action Completion (pie, left) + Commitment Score Distribution (bar, right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Action Completion */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                Action Completion
              </h4>
              <span className="tag tag--yellow">% of delivered actions validated</span>
            </div>
            <div className="bg-white rounded-2xl p-4 flex flex-col" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-md)", height: 320 }}>
              {completionLoading ? (
                emptyState("Loading…")
              ) : !completionBuckets || completionBuckets.totalUsers === 0 ? (
                emptyState("No members in scope yet")
              ) : (
                <>
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                        <Pie
                          data={completionTiles}
                          dataKey="value"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          outerRadius="62%"
                          minAngle={2}
                          labelLine={false}
                          label={(entry) => {
                            const { cx, cy, midAngle, outerRadius, fill, name, value } = entry;
                            if (!value || cx == null || cy == null || midAngle == null || outerRadius == null) return null;
                            const RADIAN = Math.PI / 180;
                            const radius = outerRadius + 20;
                            const x = cx + radius * Math.cos(-midAngle * RADIAN);
                            const y = cy + radius * Math.sin(-midAngle * RADIAN);
                            return (
                              <text
                                x={x}
                                y={y}
                                fill={fill}
                                textAnchor={x > cx ? "start" : "end"}
                                dominantBaseline="central"
                                fontSize={11}
                                fontWeight={600}
                              >
                                {`${name}: ${value}`}
                              </text>
                            );
                          }}
                        >
                          {completionTiles.map((tile) => (
                            <Cell key={tile.label} fill={tile.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 pt-2 pb-0.5 shrink-0">
                    {completionTiles.map((tile) => (
                      <li key={tile.label} className="flex items-center gap-1.5 text-[11px] font-semibold leading-none" style={{ color: tile.color }}>
                        <span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ background: tile.color }} />
                        {tile.label}
                      </li>
                    ))}
                  </ul>
                </>
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
                  <ReBarChart data={scoreBucketChartData} margin={{ top: 8, right: 12, left: 8, bottom: 28 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} tickMargin={8} height={48} label={{ value: "Commitment score band", position: "insideBottom", offset: -16, fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={48} label={{ value: "Users", angle: -90, position: "insideLeft", offset: 8, fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="Users" radius={[6, 6, 0, 0]}>
                      {scoreBucketChartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
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
                <table className="w-full text-left border-collapse table-fixed min-w-[520px] text-xs">
                  <thead>
                    <tr style={{ background: "var(--color-bg-dark)", color: "var(--white)" }}>
                      <th className="px-3 py-3 text-xs font-semibold" style={{ borderRight: "1px solid rgba(255,255,255,0.08)" }}>Rank / Name</th>
                      <th className="px-2 py-3 text-xs font-semibold text-center">Commitment score</th>
                      <th className="px-2 py-3 text-xs font-semibold text-center">Points</th>
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
                        <td className="px-2 py-2.5 text-center">
                          <span className="text-xs font-semibold">{user.commitmentMaximum > 0 ? `${user.commitmentPct}%` : "No plan"}</span>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span className="text-xs font-semibold">{user.commitmentPoints}/{user.commitmentMaximum} pts</span>
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
          <div className="bg-white rounded-2xl p-4 overflow-visible" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-md)", height: 300 }}>
            {weeklyTrendLoading ? (
              emptyState("Loading…")
            ) : weeklyTrend.length === 0 ? (
              emptyState("No finalised plans yet")
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ReBarChart data={weeklyTrendChartData} margin={{ top: 8, right: 12, left: 8, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} tickMargin={8} height={48} label={{ value: "Week (from batch start)", position: "insideBottom", offset: -16, fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} width={48} label={{ value: "Avg. commitment %", angle: -90, position: "insideLeft", offset: 8, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="Avg. commitment %" fill="#3699FC" radius={[6, 6, 0, 0]} />
                </ReBarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Email Engagement: opens + clicks */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
              Email Engagement
            </h4>
            <span className="tag tag--yellow">Reminder Emails · Opens &amp; Clicks</span>
          </div>

          {!emailWebhookConfigured && !emailLoading && (
            <div className="card__inset flex items-start gap-3" style={{ borderColor: "var(--color-warning, #f0bc00)", background: "rgba(255,206,0,0.08)" }}>
              <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#f0bc00" }} />

            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Reminder — open rate", value: emailReminderTotals?.openRate, sub: emailReminderTotals ? `${emailReminderTotals.opened} opened of ${emailReminderTotals.sent} sent` : "No sends yet", color: "#23CE6B" },
              { label: "Reminder — click rate", value: emailReminderTotals?.clickRate, sub: emailReminderTotals ? `${emailReminderTotals.clicked} clicked of ${emailReminderTotals.sent} sent` : "No sends yet", color: "#F97316" },
            ].map((card) => (
              <div key={card.label} className="bg-white rounded-xl p-4 flex flex-col gap-2" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-sm)" }}>
                <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>{card.label}</span>
                <span className="text-2xl font-bold leading-none" style={{ color: card.color }}>
                  {emailLoading ? "…" : `${card.value ?? 0}%`}
                </span>
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{card.sub}</span>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl p-4 overflow-visible" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-md)", height: 320 }}>
            {emailLoading ? (
              emptyState("Loading…")
            ) : emailOpenChartData.length === 0 ? (
              emptyState("No week-attributed sends yet")
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ReBarChart data={emailOpenChartData} margin={{ top: 24, right: 12, left: 8, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} tickMargin={8} height={48} label={{ value: "Week (from batch start)", position: "insideBottom", offset: -16, fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} width={48} label={{ value: "Rate %", angle: -90, position: "insideLeft", offset: 8, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingBottom: 8 }} />
                  <Bar dataKey="Reminder open %" fill="#23CE6B" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Reminder click %" fill="#F97316" radius={[6, 6, 0, 0]} />
                </ReBarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
