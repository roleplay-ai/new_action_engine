"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Eye,
  MousePointer2,
  CheckCircle2,
  Trophy,
  AlertCircle,
  TrendingUp,
  ThumbsUp,
  ThumbsDown,
  Users,
  BookOpen,
  MessageSquareText,
  Layers,
  ArrowRight,
  Sparkles,
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
  getWeeklyActionChartData,
  getCohortAnalyticsOverview,
  type CohortAnalyticsSummary,
} from "@/app/actions/admin-analytics";
import { listContentItems } from "@/app/actions/prepare-content";

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

const QUICK_LINKS = [
  { href: "/admin/control-panel/cohorts", icon: Users, label: "Batch Management", desc: "Create batches, assign members, trainers & content" },
  { href: "/admin/control-panel/content", icon: BookOpen, label: "Content Management", desc: "Manage the Prepare video, quiz & pre-read library" },
  { href: "/admin/conversations", icon: MessageSquareText, label: "Conversations", desc: "Read and join any batch's conversation" },
  { href: "/admin/analytics/cohorts", icon: Layers, label: "Batch Analytics", desc: "Compare engagement across every batch" },
  { href: "/admin/analytics/engagement", icon: TrendingUp, label: "User Engagement", desc: "Leaderboard & per-user metrics" },
];

export function DashboardView({ companyId }: DashboardViewProps) {
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [funnelError, setFunnelError] = useState<string | null>(null);
  const [funnelLoading, setFunnelLoading] = useState(true);
  const [weeklyChartData, setWeeklyChartData] = useState<
    { name: string; Accepted: number; Skipped: number; Successful: number }[]
  >([]);
  const [weeklyChartLoading, setWeeklyChartLoading] = useState(false);
  const [cohortEntries, setCohortEntries] = useState<CohortAnalyticsSummary[]>([]);
  const [cohortsLoading, setCohortsLoading] = useState(false);
  const [contentStats, setContentStats] = useState<{ total: number; active: number } | null>(null);

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

  useEffect(() => {
    if (!companyId) {
      setCohortEntries([]);
      return;
    }
    setCohortsLoading(true);
    getCohortAnalyticsOverview(companyId)
      .then(({ entries, error }) => {
        setCohortEntries(!error ? entries ?? [] : []);
      })
      .finally(() => setCohortsLoading(false));
  }, [companyId]);

  useEffect(() => {
    listContentItems().then(({ items, error }) => {
      if (error || !items) {
        setContentStats(null);
        return;
      }
      setContentStats({ total: items.length, active: items.filter((item) => item.isActive).length });
    });
  }, []);

  const activeCohorts = cohortEntries.filter((c) => c.memberCount > 0);
  const avgCohortEngagement = activeCohorts.length
    ? Math.round(activeCohorts.reduce((sum, c) => sum + c.consistentlyActivePct, 0) / activeCohorts.length)
    : 0;
  const topCohorts = [...activeCohorts].sort((a, b) => b.consistentlyActivePct - a.consistentlyActivePct).slice(0, 3);
  const bottomCohorts = [...activeCohorts]
    .sort((a, b) => a.consistentlyActivePct - b.consistentlyActivePct)
    .slice(0, 3);

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
      </div>

      {/* ── QUICK LINKS ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              title={link.desc}
              className="bg-white rounded-2xl p-3.5 flex flex-col gap-2 transition-shadow hover:shadow-md"
              style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-sm)" }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,206,0,0.14)", color: "var(--shadow-grey)" }}>
                <Icon size={16} strokeWidth={2} />
              </div>
              <span className="text-xs font-semibold leading-tight" style={{ color: "var(--color-text-primary)" }}>{link.label}</span>
            </Link>
          );
        })}
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
          <Link href="/admin/conversations" className="btn btn--primary-dark btn--sm btn--full mt-5 flex items-center justify-center gap-1.5">
            <MessageSquareText size={14} /> Message their batch
          </Link>
        </div>
      </div>

      {/* ── ORG SNAPSHOT ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href="/admin/analytics/cohorts"
          className="bg-white rounded-2xl p-4 flex items-center gap-3 transition-shadow hover:shadow-md"
          style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-sm)" }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: "#A855F7" }}>
            <Layers size={18} strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-bold leading-none" style={{ color: "var(--color-text-primary)" }}>
              {cohortsLoading ? "…" : activeCohorts.length}
            </p>
            <p className="text-xs font-medium mt-1" style={{ color: "var(--color-text-muted)" }}>Active batches</p>
          </div>
          <ArrowRight size={15} style={{ color: "var(--color-text-muted)" }} />
        </Link>

        <Link
          href="/admin/analytics/cohorts"
          className="bg-white rounded-2xl p-4 flex items-center gap-3 transition-shadow hover:shadow-md"
          style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-sm)" }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: "#3699FC" }}>
            <Sparkles size={18} strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-bold leading-none" style={{ color: "var(--color-text-primary)" }}>
              {cohortsLoading ? "…" : `${avgCohortEngagement}%`}
            </p>
            <p className="text-xs font-medium mt-1" style={{ color: "var(--color-text-muted)" }}>Avg. batch engagement</p>
          </div>
          <ArrowRight size={15} style={{ color: "var(--color-text-muted)" }} />
        </Link>

        <Link
          href="/admin/control-panel/content"
          className="bg-white rounded-2xl p-4 flex items-center gap-3 transition-shadow hover:shadow-md"
          style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-sm)" }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: "#23CE6B" }}>
            <BookOpen size={18} strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-bold leading-none" style={{ color: "var(--color-text-primary)" }}>
              {contentStats ? contentStats.active : "…"}
            </p>
            <p className="text-xs font-medium mt-1" style={{ color: "var(--color-text-muted)" }}>
              Active content items{contentStats ? ` · ${contentStats.total} total` : ""}
            </p>
          </div>
          <ArrowRight size={15} style={{ color: "var(--color-text-muted)" }} />
        </Link>
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

      {/* ── USER ENGAGEMENT ── */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 bg-white rounded-2xl p-5" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-md)" }}>
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

      {/* ── BATCH SPOTLIGHT ── */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
            Batch Spotlight
          </h3>
          <Link href="/admin/analytics/cohorts" className="text-xs font-semibold flex items-center gap-1" style={{ color: "var(--dodger-blue)" }}>
            View all batches <ArrowRight size={12} />
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top performing */}
          <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid rgba(35,206,107,0.2)", boxShadow: "0 4px 24px rgba(35,206,107,0.10)" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(35,206,107,0.12)", color: "#16a34a" }}>
                <ThumbsUp size={16} strokeWidth={2} />
              </div>
              <div>
                <h4 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Top Batches</h4>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Most consistently active</p>
              </div>
            </div>
            {cohortsLoading ? emptyState("Loading…")
              : topCohorts.length === 0 ? emptyState("No batch data yet")
              : (
              <SkillProgressBars
                bars={topCohorts.map((c, i) => ({
                  label: `#${i + 1} ${c.batchName}`,
                  value: c.consistentlyActivePct,
                  color: "#23CE6B",
                  sublabel: `${c.memberCount} member${c.memberCount === 1 ? "" : "s"}`,
                }))}
                animationDelay={110}
                animationDuration={750}
              />
            )}
          </div>

          {/* Needing attention */}
          <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid rgba(237,69,81,0.15)", boxShadow: "0 4px 24px rgba(237,69,81,0.08)" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(237,69,81,0.10)", color: "#dc2626" }}>
                <ThumbsDown size={16} strokeWidth={2} />
              </div>
              <div>
                <h4 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Batches Needing Attention</h4>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Lowest consistency, worth a nudge</p>
              </div>
            </div>
            {cohortsLoading ? emptyState("Loading…")
              : bottomCohorts.length === 0 ? emptyState("No batch data yet")
              : (
              <SkillProgressBars
                bars={bottomCohorts.map((c, i) => ({
                  label: `#${i + 1} ${c.batchName}`,
                  value: c.consistentlyActivePct,
                  color: "#ED4551",
                  sublabel: `${c.memberCount} member${c.memberCount === 1 ? "" : "s"}`,
                }))}
                animationDelay={110}
                animationDuration={750}
              />
            )}
          </div>
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
    </div>
  );
}
