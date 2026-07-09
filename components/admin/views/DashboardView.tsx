"use client";

import React, { useState, useEffect } from "react";
import {
  Eye,
  MousePointer2,
  CheckCircle2,
  Download,
  Trophy,
  AlertCircle,
  TrendingUp,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
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
import SkillProgressBars from "@/components/admin/SkillProgressBars";
import {
  getBehaviouralJourneyFunnel,
  getDriversEffectiveness,
  getActionMetrics,
  getWeeklyActionChartData,
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

interface FunnelData {
  usersCount: number;
  totalActionsDelivered: number;
  averageActionsPerUser: number;
  intentionTotal: number;
  actionsValidated: number;
  consistentlyActivePct: number;
  consistentlyActiveUsersCount: number;
  actionReadersCount: number;
  actionReadersPct: number;
  actionTakersCount: number;
  actionTakersPct: number;
  inactiveUsersCount: number;
  inactiveUsersPct: number;
}

interface DashboardViewProps {
  companyId: string | null;
}

export function DashboardView({ companyId }: DashboardViewProps) {
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [funnelError, setFunnelError] = useState<string | null>(null);
  const [funnelLoading, setFunnelLoading] = useState(true);
  const [driversChartData, setDriversChartData] = useState<
    { name: string; score: number; color: string }[]
  >([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [driversError, setDriversError] = useState<string | null>(null);
  const [adoptionIndexMetrics, setAdoptionIndexMetrics] = useState<
    ActionMetricEntry[]
  >([]);
  const [adoptionIndexLoading, setAdoptionIndexLoading] = useState(false);
  const [weeklyChartData, setWeeklyChartData] = useState<
    { name: string; Accepted: number; Skipped: number; Successful: number }[]
  >([]);
  const [weeklyChartLoading, setWeeklyChartLoading] = useState(false);

  const engagementSegments = funnel
    ? [
        {
          label: "ACTION READERS",
          sub: "(≥1 USER ACTION)",
          value: `${funnel.actionReadersPct}%`,
          color: "#2ecc71",
        },
        {
          label: "ACTION TAKERS",
          sub: "(VALIDATED)",
          value: `${funnel.actionTakersPct}%`,
          color: "#3699FC",
        },
        {
          label: "INACTIVE USERS",
          sub: "(0 USER ACTIONS)",
          value: `${funnel.inactiveUsersPct}%`,
          color: "#f87171",
        },
      ]
    : [];

  useEffect(() => {
    if (!companyId) {
      setFunnel(null);
      setFunnelError("Select a company");
      setFunnelLoading(false);
      return;
    }
    setFunnelLoading(true);
    setFunnelError(null);
    getBehaviouralJourneyFunnel(companyId)
      .then((res) => {
        if (res.error) {
          setFunnelError(res.error);
          setFunnel(null);
        } else {
          setFunnel({
            usersCount: res.usersCount ?? 0,
            totalActionsDelivered: res.totalActionsDelivered ?? 0,
            averageActionsPerUser: res.averageActionsPerUser ?? 0,
            intentionTotal: res.intentionTotal ?? 0,
            actionsValidated: res.actionsValidated ?? 0,
            consistentlyActivePct: res.consistentlyActivePct ?? 0,
            consistentlyActiveUsersCount: res.consistentlyActiveUsersCount ?? 0,
            actionReadersCount: res.actionReadersCount ?? 0,
            actionReadersPct: res.actionReadersPct ?? 0,
            actionTakersCount: res.actionTakersCount ?? 0,
            actionTakersPct: res.actionTakersPct ?? 0,
            inactiveUsersCount: res.inactiveUsersCount ?? 0,
            inactiveUsersPct: res.inactiveUsersPct ?? 0,
          });
        }
      })
      .finally(() => setFunnelLoading(false));
  }, [companyId]);

  useEffect(() => {
    if (!companyId) {
      setDriversChartData([]);
      setDriversError(null);
      return;
    }
    setDriversLoading(true);
    setDriversError(null);
    getDriversEffectiveness(companyId)
      .then(({ entries, error }) => {
        if (error) {
          setDriversError(error);
          setDriversChartData([]);
          return;
        }
        const chart = (entries ?? []).map((e: DriversEffectivenessEntry) => ({
          name: e.theme,
          score: e.acceptancePct,
          color: THEME_CHART_COLORS[e.theme] ?? "#94a3b8",
        }));
        setDriversChartData(chart);
      })
      .finally(() => setDriversLoading(false));
  }, [companyId]);

  useEffect(() => {
    if (!companyId) {
      setAdoptionIndexMetrics([]);
      return;
    }
    setAdoptionIndexLoading(true);
    getActionMetrics(companyId)
      .then(({ entries, error }) => {
        if (!error && entries?.length) setAdoptionIndexMetrics(entries);
        else setAdoptionIndexMetrics([]);
      })
      .finally(() => setAdoptionIndexLoading(false));
  }, [companyId]);

  useEffect(() => {
    if (!companyId) {
      setWeeklyChartData([]);
      return;
    }
    setWeeklyChartLoading(true);
    getWeeklyActionChartData(companyId)
      .then(({ entries, error }) => {
        if (error) {
          setWeeklyChartData([]);
          return;
        }
        const chart = (entries ?? []).map((e) => ({
          name: e.name,
          Accepted: e.accepted,
          Skipped: e.skipped,
          Successful: e.successful,
        }));
        setWeeklyChartData(chart);
      })
      .finally(() => setWeeklyChartLoading(false));
  }, [companyId]);

  const top3Adoption = adoptionIndexMetrics.slice(0, 3);
  const bottom3Resistance = adoptionIndexMetrics.slice(-3).reverse();

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
        <button className="btn btn--decline btn--sm flex items-center gap-2">
          <Download size={14} strokeWidth={2} /> Download Report
        </button>
      </div>

      {/* ── HERO SUMMARY CARDS ── */}
      <div className="grid grid-cols-12 gap-4">

        {/* Consistently Active */}
        <div
          className="col-span-12 lg:col-span-8 rounded-2xl p-5 sm:p-6 flex items-center gap-5 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #23CE6B 0%, #1aad58 100%)",
            boxShadow: "0 8px 32px rgba(35,206,107,0.25)",
          }}
        >
          {/* Icon */}
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.22)" }}
          >
            <Trophy size={32} className="text-white" strokeWidth={2} />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold mb-1" style={{ color: "rgba(255,255,255,0.7)", letterSpacing: "0.05em" }}>
              Consistently Active Users
            </p>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-4xl sm:text-5xl font-bold text-white leading-none">
                {funnel && funnel.usersCount > 0
                  ? `${Math.round((funnel.consistentlyActiveUsersCount / funnel.usersCount) * 100)}%`
                  : "—"}
              </span>
              <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>
                {funnel ? funnel.consistentlyActiveUsersCount.toLocaleString() : "—"} of {funnel?.usersCount ?? "—"} users
              </span>
            </div>
            <p className="text-xs mt-2 font-medium" style={{ color: "rgba(255,255,255,0.6)" }}>
              Behavioral champions staying engaged with their actions
            </p>
          </div>

          {/* Decorative icon */}
          <TrendingUp size={64} className="shrink-0 opacity-10 text-white hidden sm:block" strokeWidth={1.5} />
        </div>

        {/* Inactive Users */}
        <div
          className="col-span-12 lg:col-span-4 rounded-2xl p-5 sm:p-6 flex flex-col justify-between"
          style={{
            background: "linear-gradient(135deg, #FFCE00 0%, #f0bc00 100%)",
            boxShadow: "0 8px 32px rgba(255,206,0,0.3)",
          }}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} strokeWidth={2} style={{ color: "rgba(34,29,35,0.55)" }} />
              <span className="text-xs font-semibold" style={{ color: "rgba(34,29,35,0.55)" }}>
                Attention Required
              </span>
            </div>
            <h4 className="text-sm font-semibold" style={{ color: "var(--shadow-grey)" }}>
              Inactive Users
            </h4>
            <p className="text-4xl sm:text-5xl font-bold leading-none" style={{ color: "#c0392b" }}>
              {funnel ? funnel.inactiveUsersCount.toLocaleString() : "—"}
            </p>
          </div>
          <button className="btn btn--primary-dark btn--sm btn--full mt-5">
            Nudge Strategy
          </button>
        </div>
      </div>

      {/* ── BEHAVIORAL JOURNEY FUNNEL ── */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
            Behavioral Journey Funnel
          </h3>
          <span className="tag tag--yellow">Company Data</span>
        </div>

        {funnelLoading && (
          <div className="rounded-xl p-8 text-center text-sm font-medium" style={{ border: "1px solid var(--color-border)", background: "white", color: "var(--color-text-muted)" }}>
            Loading funnel…
          </div>
        )}
        {funnelError && !funnelLoading && (
          <div className="card__inset flex items-start gap-3" style={{ borderColor: "var(--color-danger)", background: "rgba(237,69,81,0.06)" }}>
            <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: "var(--color-danger)" }} />
            <p className="text-sm font-semibold" style={{ color: "var(--color-danger)" }}>{funnelError}</p>
          </div>
        )}

        {funnel && !funnelLoading && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { icon: <Eye size={18} strokeWidth={2} />, color: "#A855F7", label: "Knowledge", sublabel: "View rate", value: funnel.totalActionsDelivered.toLocaleString(), detail: `Avg ${funnel.averageActionsPerUser} actions/user` },
              { icon: <MousePointer2 size={18} strokeWidth={2} />, color: "#F97316", label: "Intention", sublabel: "Accepted", value: funnel.intentionTotal.toLocaleString(), detail: `${funnel.actionTakersCount.toLocaleString()} action takers` },
              { icon: <CheckCircle2 size={18} strokeWidth={2} />, color: "#3B82F6", label: "Actions", sublabel: "Validated", value: funnel.actionsValidated.toLocaleString(), detail: `${funnel.actionReadersCount.toLocaleString()} readers` },
            ].map((card) => (
              <div key={card.label} className="bg-white rounded-xl p-4 flex flex-col gap-3" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-sm)" }}>
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: card.color }}>
                    {card.icon}
                  </div>
                  <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>{card.label}</span>
                </div>
                <div>
                  <span className="text-2xl font-bold block leading-none mb-0.5" style={{ color: "var(--color-text-primary)" }}>
                    {card.value}
                  </span>
                  <span className="text-xs font-medium" style={{ color: card.color }}>{card.sublabel}</span>
                </div>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{card.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── DRIVERS EFFECTIVENESS & USER ENGAGEMENT ── */}
      <div className="grid grid-cols-12 gap-4">

        {/* Drivers — SkillProgressBars */}
        <div className="col-span-12 lg:col-span-7 bg-white rounded-2xl p-5" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-md)" }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Drivers Effectiveness
              </h3>
              <p className="text-xs font-medium mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                % of actions accepted by theme
              </p>
            </div>
            <Download size={15} strokeWidth={2} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
          </div>

          {driversLoading ? (
            <div className="py-10 text-center text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>Loading…</div>
          ) : driversError ? (
            <div className="py-10 text-center text-sm font-semibold" style={{ color: "var(--color-danger)" }}>{driversError}</div>
          ) : driversChartData.length === 0 ? (
            <div className="py-10 text-center text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>No theme data yet</div>
          ) : (
            <SkillProgressBars
              bars={driversChartData.map((d) => ({
                label: d.name,
                value: d.score,
                color: d.color,
                sublabel: `${d.score}% acceptance rate`,
              }))}
              animationDelay={100}
              animationDuration={750}
            />
          )}
        </div>

        {/* User engagement breakdown — SkillProgressBars */}
        <div className="col-span-12 lg:col-span-5 bg-white rounded-2xl p-5" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-md)" }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
                User Engagement
              </h3>
              <p className="text-xs font-medium mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Breakdown by segment
              </p>
            </div>
          </div>

          {engagementSegments.length === 0 ? (
            emptyState("No engagement data yet")
          ) : (
            <SkillProgressBars
              bars={engagementSegments.map((e) => ({
                label: e.label.charAt(0) + e.label.slice(1).toLowerCase().replace(/_/g, " "),
                value: parseInt(e.value, 10) || 0,
                color: e.color,
                sublabel: e.sub.replace(/[()]/g, "").toLowerCase(),
              }))}
              animationDelay={120}
              animationDuration={800}
            />
          )}
        </div>
      </div>

      {/* ── CHARTS SECTION ── */}
      <div className="grid grid-cols-1 gap-4">

        {/* Weekly Actions bar chart */}
        <section className="bg-white rounded-2xl p-5" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-md)" }}>
          <h3 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Weekly Actions
          </h3>
          <p className="text-xs font-medium mt-0.5 mb-4" style={{ color: "var(--color-text-muted)" }}>
            Per delivery (actions × users)
          </p>
          <div className="h-[260px] w-full">
            {weeklyChartLoading ? emptyState("Loading…")
              : weeklyChartData.length === 0 ? emptyState("No delivery data yet")
              : (
              <ResponsiveContainer width="100%" height="100%">
                <ReBarChart data={weeklyChartData} barGap={3} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--color-border)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fontWeight: 500, fill: "#8A8090" }}
                    axisLine={{ stroke: "var(--color-border)", strokeWidth: 1 }}
                    tickLine={false}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fontWeight: 500, fill: "#8A8090" }}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ paddingBottom: "16px", fontSize: "12px", fontWeight: 600 }}
                  />
                  <Bar dataKey="Accepted" fill="#23CE6B" barSize={10} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Skipped" fill="#FFCE00" barSize={10} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Successful" fill="#3699FC" barSize={10} radius={[4, 4, 0, 0]} />
                </ReBarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      {/* ── ACTION ADOPTION INDEX ── */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
            Action Adoption Index
          </h3>
          <span className="tag tag--blue">Global Benchmarking</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Highest Adoption */}
          <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid rgba(35,206,107,0.2)", boxShadow: "0 4px 24px rgba(35,206,107,0.10)" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(35,206,107,0.12)", color: "#16a34a" }}>
                <ThumbsUp size={16} strokeWidth={2} />
              </div>
              <div>
                <h4 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Highest Adoption</h4>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Top performing actions</p>
              </div>
            </div>
            {adoptionIndexLoading ? emptyState("Loading…")
              : top3Adoption.length === 0 ? emptyState("No action data yet")
              : (
              <SkillProgressBars
                bars={top3Adoption.map((a, i) => ({
                  label: `#${i + 1} ${a.title}`,
                  value: a.acceptedCount > 0 ? a.conversionPct : 0,
                  color: "#23CE6B",
                  sublabel: `${a.theme} · ${a.conversionPct}% conversion`,
                }))}
                animationDelay={110}
                animationDuration={750}
              />
            )}
          </div>

          {/* Highest Resistance */}
          <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid rgba(237,69,81,0.15)", boxShadow: "0 4px 24px rgba(237,69,81,0.08)" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(237,69,81,0.10)", color: "#dc2626" }}>
                <ThumbsDown size={16} strokeWidth={2} />
              </div>
              <div>
                <h4 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Highest Resistance</h4>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Actions needing attention</p>
              </div>
            </div>
            {adoptionIndexLoading ? emptyState("Loading…")
              : bottom3Resistance.length === 0 ? emptyState("No action data yet")
              : (
              <SkillProgressBars
                bars={bottom3Resistance.map((a, i) => ({
                  label: `#${i + 1} ${a.title}`,
                  value: a.acceptedCount > 0 ? a.conversionPct : 0,
                  color: "#ED4551",
                  sublabel: `${a.theme} · ${a.conversionPct}% conversion`,
                }))}
                animationDelay={110}
                animationDuration={750}
              />
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
