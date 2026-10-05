"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, CalendarDays, Megaphone, MessageSquareText, Network, Users } from "lucide-react";
import { getCohortDetail } from "@/app/actions/cohorts";
import { getCohortNotices } from "@/app/actions/cohort-notices";
import { getCohortMessageCount } from "@/app/actions/cohort-chat";
import { listCohortContent } from "@/app/actions/prepare-content";
import { nextUpcomingCohortDate } from "@/lib/cohort-dates";
import { batchLabel, useControlPanelBatch, useReportViewReady } from "./shared";

type Summary = { dates: string[]; members: number; withoutTeam: number; notices: number; content: number; messages: number };

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00`));
}

export function ControlPanelHome() {
  const { cohortId, option, loading: optionsLoading } = useControlPanelBatch();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cohortId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all([getCohortDetail(cohortId), getCohortNotices(cohortId), listCohortContent(cohortId), getCohortMessageCount(cohortId)])
      .then(([detail, notices, content, chat]) => {
        if (cancelled) return;
        const members = detail.members ?? [];
        setSummary({
          dates: detail.cohort?.dates ?? [],
          members: members.length,
          withoutTeam: members.filter((member) => !member.tag).length,
          notices: notices.notices?.length ?? 0,
          content: content.items?.length ?? 0,
          messages: chat.count ?? 0,
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cohortId]);

  useReportViewReady(!optionsLoading && !loading);

  const next = summary ? nextUpcomingCohortDate(summary.dates) : null;
  // Each card's chip states what needs attention before the card is opened.
  const cards: { href: string; title: string; text: string; color: string; Icon: typeof Users; status: React.ReactNode }[] = [
    {
      href: "/admin/control-panel/participants",
      title: "Participant list",
      text: "Choose who from your company is part of this batch.",
      color: "#16A34A",
      Icon: Users,
      status: !summary ? null : <span className={`cp-pill ${summary.members ? "cp-pill--ok" : "cp-pill--warn"}`}>{summary.members} in batch</span>,
    },
    {
      href: "/admin/control-panel/dates",
      title: "Add training dates",
      text: "Add, change or remove the training days for this batch.",
      color: "#2563EB",
      Icon: CalendarDays,
      status: !summary ? null : summary.dates.length === 0
        ? <span className="cp-pill cp-pill--warn">No dates yet</span>
        : <span className={`cp-pill ${next ? "cp-pill--ok" : ""}`}>{summary.dates.length} {summary.dates.length === 1 ? "date" : "dates"}{next ? ` · next ${formatDate(next)}` : ""}</span>,
    },
    {
      href: "/admin/control-panel/teams",
      title: "Team assign",
      text: "Put each person in a team. Rename teams for this batch.",
      color: "#7E22CE",
      Icon: Network,
      status: !summary ? null : summary.members === 0
        ? <span className="cp-pill">Add people first</span>
        : summary.withoutTeam
          ? <span className="cp-pill cp-pill--warn">{summary.withoutTeam} need a team</span>
          : <span className="cp-pill cp-pill--ok">Everyone has a team</span>,
    },
    {
      href: "/admin/control-panel/content",
      title: "Training content",
      text: "Choose which videos, quizzes and pre-reads this batch gets.",
      color: "#8A6A00",
      Icon: BookOpen,
      status: !summary ? null : summary.content
        ? <span className="cp-pill cp-pill--ok">{summary.content} assigned</span>
        : <span className="cp-pill cp-pill--warn">No content yet</span>,
    },
    {
      href: "/admin/control-panel/announcements",
      title: "Announcements",
      text: "Post a notice on the batch notice board.",
      color: "#C2410C",
      Icon: Megaphone,
      status: !summary ? null : <span className="cp-pill">{summary.notices} posted</span>,
    },
    {
      href: "/admin/control-panel/conversations",
      title: "Conversations",
      text: "Read and join the group conversation of this batch.",
      color: "#0E7490",
      Icon: MessageSquareText,
      status: !summary ? null : <span className="cp-pill">{summary.messages} {summary.messages <= 1 ? "message" : "messages"}</span>,
    },
  ];

  return (
    <section className="cp-page">
      <div className="cp-head">
        <div className="cp-head-row">
          <div>
            <h1>Control panel</h1>
            <p>
              {option ? <>Choose what you want to do for <strong>{batchLabel(option)}</strong>.</> : "Choose a batch and module at the top right, then pick a task below."}
            </p>
          </div>
        </div>
      </div>
      <div className="cp-cards">
        {cards.map(({ href, title, text, color, Icon, status }) => (
          <Link key={href} href={href} className="cp-card" style={{ "--cp-c": color } as React.CSSProperties}>
            <span className="cp-card-icon"><Icon size={22} /></span>
            <h2>{title}</h2>
            <p>{text}</p>
            <span className="cp-card-foot">
              {status ?? <span className="cp-pill cp-pill--ghost">{cohortId ? "…" : "No batch chosen"}</span>}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
