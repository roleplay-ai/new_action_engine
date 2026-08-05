"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRight, CalendarDays, Check, CircleUserRound, FileText, Leaf, Lightbulb, NotebookPen, Play, Sparkles, Target, TrendingUp, Users, X } from "lucide-react";
import { useEngine } from "@/lib/store";
import { getJourneyData } from "@/app/actions/journey";
import { markContentViewed } from "@/app/actions/prepare-progress";
import VideoCard from "@/components/prepare/VideoCard";
import PrereadCard from "@/components/prepare/PrereadCard";
import PdfReader from "@/components/prepare/PdfReader";
import QuizCard from "@/components/prepare/QuizCard";
import CohortChat from "@/components/journey/CohortChat";
import RcplWorkspace from "@/components/journey/RcplWorkspace";
import { usePageLoading } from "@/components/PageLoadingProvider";
import type { JourneyData, PrepareContentItem, UserPrepareProgress } from "@/lib/types";
import { estimateMinutes } from "@/lib/prepare-estimate";
import { resolveVideoEmbed, resolveVideoThumbnail } from "@/lib/video-embed";

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
  return `${isPdfResource(item) ? "PDF" : "Pre-read"} · Recommended`;
}

function isPdfResource(item: PrepareContentItem) {
  return item.type === "preread" && !!item.prereadUrl && /\.pdf(?:$|[?#])/i.test(item.prereadUrl);
}

function resourceKind(item: PrepareContentItem) {
  if (item.type === "video") return "Video";
  if (item.type === "quiz") return "Quiz";
  return isPdfResource(item) ? "PDF" : "Resource";
}

function LibraryMediaPreview({ item }: { item: PrepareContentItem }) {
  if (item.type === "video" && item.videoUrl) {
    const thumb = resolveVideoThumbnail(item.videoUrl);
    if (thumb) {
      return (
        <>
          <img className="journey-v2-media-thumb" src={thumb} alt="" loading="lazy" />
          <span className="journey-v2-media-play"><Play size={18} fill="currentColor" /></span>
        </>
      );
    }
    const embed = resolveVideoEmbed(item.videoUrl);
    if (embed.kind === "file") {
      return (
        <>
          <video className="journey-v2-media-thumb" src={embed.src} muted playsInline preload="metadata" />
          <span className="journey-v2-media-play"><Play size={18} fill="currentColor" /></span>
        </>
      );
    }
  }

  if (isPdfResource(item) && item.prereadUrl) {
    return (
      <iframe
        className="journey-v2-media-thumb journey-v2-media-thumb--pdf"
        src={`${item.prereadUrl}#page=1&view=FitH&toolbar=0&navpanes=0`}
        title={`${item.title} preview`}
        tabIndex={-1}
        loading="lazy"
      />
    );
  }

  const Icon = item.type === "video" ? Play : FileText;
  return <Icon size={item.type === "video" ? 30 : 27} fill={item.type === "video" ? "currentColor" : "none"} />;
}

export default function PrepareClient({ initialData }: { initialData: JourneyData }) {
  const { cohort: selectedCohort, personalPlanState } = useEngine();
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
  const preparationComplete = items.length === 0 || completedCount === items.length;
  const nextIncompleteItem = useMemo(
    () => items.find((item) => progress[item.id]?.status !== "completed") ?? items[0] ?? null,
    [items, progress]
  );
  const planStarted = personalPlanState !== "none";
  const planActive = personalPlanState === "active" || personalPlanState === "archived";
  const nextHref = !preparationComplete ? null : !planStarted ? "/plan#notes" : !planActive ? "/plan#action-plan" : "/actions";
  const nextTitle = !preparationComplete ? "Finish your preparation" : !planStarted ? "Capture your thinking" : !planActive ? "Review your plan" : "Continue your practice";
  const nextCopy = !preparationComplete
    ? `${items.length - completedCount} preparation item${items.length - completedCount === 1 ? " remains" : "s remain"}.`
    : !planStarted
      ? "Write down what mattered, then shape it into a personal plan."
      : !planActive
        ? "Edit and arrange your actions before they go live."
        : "Your actions are ready when their practice window opens.";

  if (error) return <div className="journey-empty"><strong>We couldn&apos;t load your journey.</strong><p>{error}</p></div>;
  if (!cohort) return <div className="journey-empty"><CircleUserRound size={32} /><strong>Your learning journey will appear here</strong><p>Ask your administrator to add you to a cohort.</p></div>;

  const visibleRoster = roster.slice(0, 4);
  const isRcplWorkspace = cohort.companyName?.trim().toLowerCase() === "rcpl university";

  const quizModal = typeof document !== "undefined" && selectedItem?.type === "quiz" ? createPortal(<QuizCard
    item={selectedItem}
    completed={progress[selectedItem.id]?.status === "completed"}
    lastScore={progress[selectedItem.id]?.lastScore}
    lastTotalQuestions={progress[selectedItem.id]?.lastTotalQuestions}
    onComplete={handleComplete}
    autoOpen
    modalOnly
    onRequestClose={() => setSelectedItem(null)}
  />, document.body) : null;

  const resourceModal = typeof document !== "undefined" && selectedItem && selectedItem.type !== "quiz" ? createPortal(<div className="journey-resource-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedItem(null); }}>
    <div className={`journey-resource-modal${isPdfResource(selectedItem) ? " journey-resource-modal--pdf" : ""}`} role="dialog" aria-modal="true" aria-labelledby="journey-resource-title">
      <header className="journey-resource-modal-head">
        <div><span>{selectedItem.type === "video" ? "Video" : isPdfResource(selectedItem) ? "PDF" : "Pre-read"}</span><strong id="journey-resource-title">{selectedItem.title}</strong></div>
        <button className="journey-modal-close" onClick={() => setSelectedItem(null)} aria-label="Close resource"><X size={18} /></button>
      </header>
      <div className="journey-resource-modal-body">
        {selectedItem.type === "video" ? (
          <VideoCard item={selectedItem} completed={progress[selectedItem.id]?.status === "completed"} onComplete={handleComplete} accentColor="#FFEEA8" />
        ) : isPdfResource(selectedItem) ? (
          <PdfReader item={selectedItem} completed={progress[selectedItem.id]?.status === "completed"} onComplete={handleComplete} />
        ) : (
          <PrereadCard item={selectedItem} completed={progress[selectedItem.id]?.status === "completed"} onComplete={handleComplete} />
        )}
      </div>
    </div>
  </div>, document.body) : null;

  if (isRcplWorkspace) {
    return <>
      <RcplWorkspace
        cohort={cohort}
        roster={roster}
        items={items}
        progress={progress}
        completedCount={completedCount}
        preparationComplete={preparationComplete}
        nextTitle={nextTitle}
        nextCopy={nextCopy}
        nextHref={nextHref}
        nextIncompleteItem={nextIncompleteItem}
        onOpenResource={setSelectedItem}
      />
      {quizModal}
      {resourceModal}
    </>;
  }

  return (
    <div className="reference-journey journey-v2 animate-in fade-in duration-700">
      <div className="journey-v2-company-brand">
        <span className="journey-v2-company-logo">
          {cohort.companyLogoUrl ? <img src={cohort.companyLogoUrl} alt={`${cohort.companyName || "Company"} logo`} /> : <span>{initials(cohort.companyName || cohort.name)}</span>}
        </span>
        <div><small>Your company workspace</small><strong>{cohort.companyName || "Your company"}</strong></div>
      </div>

      <section className="journey-v2-skill-hero">
        <div className="journey-v2-cohort-mark">{cohort.logoUrl ? <img src={cohort.logoUrl} alt={`${cohort.name} logo`} /> : <span>{initials(cohort.name)}</span>}</div>
        <div className="journey-v2-hero-copy">
          <span>{selectedCohort?.isCurrent ? "Current cohort" : "Earlier cohort"}</span>
          <h1>{cohort.name}</h1>
          <p>{cohort.description || "Turn what you learn into something useful in your work and career."}</p>
        </div>
        <div className="journey-v2-promise">
          <div><TrendingUp size={22} /></div>
          <strong>Choose what matters to you. Build a personal plan. Practise through small actions.</strong>
        </div>
      </section>

      <section className="journey-v2-rail" aria-label="Your learning journey">
        <div className={`journey-v2-step ${preparationComplete ? "done" : "current"}`}><b>{preparationComplete ? <Check size={20} /> : <Lightbulb size={20} />}</b><span><strong>Learn</strong><small>Session</small></span></div>
        <div className={`journey-v2-step ${preparationComplete && !planStarted ? "current" : planStarted ? "done" : ""}`}><b>{planStarted ? <Check size={20} /> : <NotebookPen size={20} />}</b><span><strong>Reflect</strong><small>Your notes</small></span></div>
        <div className={`journey-v2-step ${planStarted && !planActive ? "current" : planActive ? "done" : ""}`}><b>{planActive ? <Check size={20} /> : <Sparkles size={20} />}</b><span><strong>Plan</strong><small>Make it yours</small></span></div>
        <div className={`journey-v2-step ${planActive ? "current" : ""}`}><b><Target size={20} /></b><span><strong>Practise</strong><small>Real work</small></span></div>
        <div className="journey-v2-step"><b><Leaf size={20} /></b><span><strong>Grow</strong><small>Keep it</small></span></div>
      </section>

      <div className="journey-v2-workspace-grid">
        <article className="journey-v2-next-card">
          <div className="journey-v2-next-icon"><ArrowRight size={24} /></div>
          <div><h2>{nextTitle}</h2><p>{nextCopy}</p></div>
          {nextHref ? (
            <Link className="journey-primary-button" href={nextHref}>Continue</Link>
          ) : (
            <button
              type="button"
              className="journey-primary-button"
              disabled={!nextIncompleteItem}
              onClick={() => nextIncompleteItem && setSelectedItem(nextIncompleteItem)}
            >
              Open
            </button>
          )}
        </article>

        <div className="journey-v2-session-cards">
          <div><span><CalendarDays size={18} /></span><strong>{formatSessionDate(cohort.startDate)}</strong><small>Session date</small></div>
          <div><span><Sparkles size={18} /></span><strong>{cohort.name}</strong><small>Current skill</small></div>
          <div><span><Users size={18} /></span><strong>{cohort.memberCount}</strong><small>Participants</small></div>
        </div>

        <section className="journey-v2-main-stack" aria-label="Workspace resources and conversation">
          <article className="journey-module-card journey-v2-resource-library" id="preparation">
            <div className="journey-v2-resource-heading">
              <div><span>Workspace library</span><h3>Videos, PDFs and session resources</h3><p className="journey-card-subtitle">Everything assigned to {cohort.name}, ready to open here.</p></div>
              <strong>{completedCount}/{items.length} complete</strong>
            </div>
            <div className="journey-v2-media-grid">
              {items.length === 0 && <div className="journey-inline-empty">No preparation has been assigned yet.</div>}
              {items.map((item) => {
                const done = progress[item.id]?.status === "completed";
                const kind = resourceKind(item);
                const hasPreview =
                  (item.type === "video" && !!item.videoUrl && (!!resolveVideoThumbnail(item.videoUrl) || resolveVideoEmbed(item.videoUrl).kind === "file"))
                  || isPdfResource(item);
                return (
                  <article
                    className={`journey-v2-media-card ${item.type} ${done ? "done" : ""}`}
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedItem(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedItem(item);
                      }
                    }}
                  >
                    <span className={`journey-v2-media-preview${hasPreview ? " has-media" : ""}`}>
                      <span className="journey-v2-media-type">{kind}</span>
                      <LibraryMediaPreview item={item} />
                      {done && <span className="journey-v2-media-done"><Check size={13} /> Done</span>}
                    </span>
                    <span className="journey-v2-media-copy"><strong>{item.title}</strong><small>{resourceMeta(item)}</small><span>{done ? "Review resource" : "Open resource"}<ArrowRight size={14} /></span></span>
                  </article>
                );
              })}
            </div>
          </article>

          <CohortChat cohortId={cohort.id} memberCount={cohort.memberCount} />
        </section>

        <aside className="journey-v2-side-stack" aria-label="Session context">
          <article className="journey-module-card journey-v2-outcomes-card">
            <span className="journey-v2-card-kicker">Session outcomes</span>
            <h3>What you should get from this session</h3>
            <div className="journey-outcomes">
              <div><b>1</b><span><strong>Understand the idea</strong><small>Connect the session to your own role.</small></span></div>
              <div><b>2</b><span><strong>Apply it to real work</strong><small>Identify a situation where you can practise.</small></span></div>
              <div><b>3</b><span><strong>Leave with a plan</strong><small>Turn your notes into clear workplace actions.</small></span></div>
            </div>
          </article>

          <article className="journey-module-card journey-v2-cohort-card">
            <span className="journey-v2-card-kicker">Learning together</span>
            <h3>Your cohort</h3>
            <p className="journey-card-subtitle">People attending this cohort with you.</p>
            <div className="journey-cohort-people">
              {visibleRoster.map((member) => <div key={member.id}><b>{initials(member.fullName)}</b><span>{member.fullName?.split(" ")[0] || "Participant"}</span></div>)}
              {roster.length > visibleRoster.length && <small>+{roster.length - visibleRoster.length} others</small>}
            </div>
          </article>
        </aside>

      </div>

      {quizModal}
      {resourceModal}
    </div>
  );
}
