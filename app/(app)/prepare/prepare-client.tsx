"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, ChevronRight, CircleUserRound, FileText, Play, Users, X } from "lucide-react";
import { useEngine } from "@/lib/store";
import { getJourneyData } from "@/app/actions/journey";
import { markContentViewed } from "@/app/actions/prepare-progress";
import VideoCard from "@/components/prepare/VideoCard";
import PrereadCard from "@/components/prepare/PrereadCard";
import QuizCard from "@/components/prepare/QuizCard";
import CohortChat from "@/components/journey/CohortChat";
import { usePageLoading } from "@/components/PageLoadingProvider";
import type { JourneyData, PrepareContentItem, UserPrepareProgress } from "@/lib/types";
import { estimateMinutes } from "@/lib/prepare-estimate";

function formatSessionDate(value?: string | null, long = false) {
  if (!value) return "Date to be announced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", long
    ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
    : { day: "numeric", month: "short" });
}

function initials(name: string | null) {
  if (!name) return "P";
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function resourceMeta(item: PrepareContentItem) {
  if (item.type === "video") {
    const minutes = estimateMinutes(item);
    return `${minutes ? `${minutes}-minute video` : "Video"} · Recommended`;
  }
  if (item.type === "quiz") return `${item.questionCount ?? 0} questions · Required`;
  return "Pre-read · Recommended";
}

export default function PrepareClient({ initialData }: { initialData: JourneyData }) {
  const { profile } = useEngine();
  const [error, setError] = useState<string | null>(initialData.error ?? null);
  const [cohort, setCohort] = useState(initialData.cohort);
  const [roster, setRoster] = useState(initialData.roster);
  const [items, setItems] = useState(initialData.items);
  const [progress, setProgress] = useState<Record<string, UserPrepareProgress>>(
    Object.fromEntries(initialData.progress.map((item) => [item.contentItemId, item]))
  );
  const [selectedItem, setSelectedItem] = useState<PrepareContentItem | null>(null);

  usePageLoading(false);

  const reloadQuietly = useCallback(async () => {
    const result = await getJourneyData();
    setError(result.error ?? null);
    setCohort(result.cohort);
    setRoster(result.roster);
    setItems(result.items);
    setProgress(Object.fromEntries(result.progress.map((item) => [item.contentItemId, item])));
  }, []);

  useEffect(() => {
    if (!selectedItem) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedItem(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedItem]);

  async function handleComplete(contentItemId: string) {
    const result = await markContentViewed(contentItemId);
    if (!result.error) await reloadQuietly();
  }

  const completedCount = useMemo(() => items.filter((item) => progress[item.id]?.status === "completed").length, [items, progress]);
  const completion = items.length ? Math.round((completedCount / items.length) * 100) : 0;

  if (error) return <div className="journey-empty"><strong>We couldn&apos;t load your journey.</strong><p>{error}</p></div>;
  if (!cohort) return <div className="journey-empty"><CircleUserRound size={32} /><strong>Your learning journey will appear here</strong><p>Ask your administrator to add you to a cohort.</p></div>;

  const firstName = profile.name.split(" ")[0];
  const currentStage = completedCount === items.length && items.length > 0 ? 2 : 1;
  const visibleRoster = roster.slice(0, 4);

  return (
    <div className="reference-journey animate-in fade-in duration-700">
      <div className="journey-page-title">
        <div>
          <span>Training workspace</span>
          <h1>{cohort.name}</h1>
          <p>{cohort.description || "Your sessions, preparation and application cycles in one place."}</p>
        </div>
        <div className="journey-cohort-filter"><label>View cohort</label><div>{cohort.name}<ChevronRight size={14} /></div></div>
      </div>

      <section className="journey-session-hero">
        <div className="journey-session-copy">
          <span className="journey-session-label">Current session · {formatSessionDate(cohort.startDate)}</span>
          <h2>{cohort.description || cohort.name}</h2>
          <p>Welcome, {firstName}. Complete your preparation, join the session ready, then turn what you learn into workplace actions.</p>
          <div className="journey-session-meta">
            <span><CalendarDays size={14} />{formatSessionDate(cohort.startDate, true)}</span>
            <span><Users size={14} />{cohort.memberCount} participants</span>
            <span>{completedCount} of {items.length} prep items complete</span>
          </div>
        </div>
        <div className="journey-hero-progress"><strong>{completion}%</strong><span>Preparation complete</span><div><i style={{ width: `${completion}%` }} /></div></div>
      </section>

      <div className="journey-module-grid">
        <CohortChat cohortId={cohort.id} memberCount={cohort.memberCount} />

        <article className="journey-module-card">
          <h3>What you should get from this session</h3>
          <div className="journey-outcomes">
            <div><b>1</b><span><strong>Understand the idea</strong><small>Connect the session content to your own role.</small></span></div>
            <div><b>2</b><span><strong>Apply it to real work</strong><small>Identify a situation where you can practise.</small></span></div>
            <div><b>3</b><span><strong>Leave with a plan</strong><small>Turn your notes into clear workplace actions.</small></span></div>
          </div>
        </article>

        <article className="journey-module-card">
          <h3>Before you arrive</h3>
          <p className="journey-card-subtitle">Only preparation assigned to this session.</p>
          <div className="journey-resources">
            {items.length === 0 && <div className="journey-inline-empty">No preparation has been assigned yet.</div>}
            {items.map((item) => {
              const done = progress[item.id]?.status === "completed";
              const Icon = item.type === "video" ? Play : FileText;
              return <div className={`journey-resource ${done ? "done" : ""}`} key={item.id}>
                <div className="journey-resource-icon">{done ? <Check size={16} /> : <Icon size={16} />}</div>
                <div><strong>{item.title}</strong><span>{resourceMeta(item)}</span></div>
                <button onClick={() => setSelectedItem(item)}>{done ? "Review" : "Open"}</button>
              </div>;
            })}
          </div>
        </article>

        <article className="journey-module-card">
          <h3>Your cohort</h3>
          <p className="journey-card-subtitle">People attending this cohort with you.</p>
          <div className="journey-cohort-people">
            {visibleRoster.map((member) => <div key={member.id}><b>{initials(member.fullName)}</b><span>{member.fullName?.split(" ")[0] || "Participant"}</span></div>)}
            {roster.length > visibleRoster.length && <small>+{roster.length - visibleRoster.length} others</small>}
          </div>
        </article>

        <article className="journey-module-card journey-module-wide">
          <h3>Your learning journey</h3>
          <p className="journey-card-subtitle">Preparation, the live session and workplace application shown together.</p>
          <div className="journey-stages">
            <div className={currentStage > 1 ? "complete" : "current"}><b>{currentStage > 1 ? <Check size={15} /> : 1}</b><span><strong>Prepare for the session</strong><small>{completedCount} of {items.length} resources complete</small></span><em>Preparation</em></div>
            <div className={currentStage === 2 ? "current" : "upcoming"}><b>2</b><span><strong>{cohort.name}</strong><small>{formatSessionDate(cohort.startDate, true)}</small></span><em>Classroom</em></div>
            <div className="upcoming"><b>3</b><span><strong>Build your practice plan</strong><small>Use your notes to create personalised actions</small></span><em>Planning</em></div>
            <div className="upcoming"><b>4</b><span><strong>Workplace practice cycle</strong><small>Complete actions at the pace you choose</small></span><em>Application</em></div>
          </div>
        </article>
      </div>

      {typeof document !== "undefined" && selectedItem?.type === "quiz" && createPortal(<QuizCard
        item={selectedItem}
        completed={progress[selectedItem.id]?.status === "completed"}
        lastScore={progress[selectedItem.id]?.lastScore}
        lastTotalQuestions={progress[selectedItem.id]?.lastTotalQuestions}
        onComplete={handleComplete}
        autoOpen
        modalOnly
        onRequestClose={() => setSelectedItem(null)}
      />, document.body)}

      {typeof document !== "undefined" && selectedItem && selectedItem.type !== "quiz" && createPortal(<div className="journey-resource-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedItem(null); }}>
        <div className="journey-resource-modal" role="dialog" aria-modal="true" aria-labelledby="journey-resource-title">
          <header className="journey-resource-modal-head">
            <div><span>{selectedItem.type === "video" ? "Video" : "Pre-read"}</span><strong id="journey-resource-title">{selectedItem.title}</strong></div>
            <button className="journey-modal-close" onClick={() => setSelectedItem(null)} aria-label="Close resource"><X size={18} /></button>
          </header>
          <div className="journey-resource-modal-body">
            {selectedItem.type === "video" ? <VideoCard item={selectedItem} completed={progress[selectedItem.id]?.status === "completed"} onComplete={handleComplete} accentColor="#FFEEA8" /> : <PrereadCard item={selectedItem} completed={progress[selectedItem.id]?.status === "completed"} onComplete={handleComplete} />}
          </div>
        </div>
      </div>, document.body)}
    </div>
  );
}
