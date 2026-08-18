"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CircleUserRound, X } from "lucide-react";
import { useEngine } from "@/lib/store";
import { getJourneyData } from "@/app/actions/journey";
import { markContentViewed } from "@/app/actions/prepare-progress";
import VideoCard from "@/components/prepare/VideoCard";
import PrereadCard from "@/components/prepare/PrereadCard";
import PdfReader from "@/components/prepare/PdfReader";
import QuizCard from "@/components/prepare/QuizCard";
import RcplWorkspace from "@/components/journey/RcplWorkspace";
import { usePageLoading } from "@/components/PageLoadingProvider";
import type { JourneyData, PrepareContentItem, UserPrepareProgress } from "@/lib/types";

function isPdfResource(item: PrepareContentItem) {
  return item.type === "preread" && !!item.prereadUrl && /\.pdf(?:$|[?#])/i.test(item.prereadUrl);
}

/**
 * Every company gets the same RcplWorkspace design (agenda, resource library,
 * batch roster, commitment buddy, facilitators, chat). Surge renders it with
 * no overrides — its hardcoded SURGE curriculum and copy stay byte-for-byte
 * unchanged. Every other company passes its own DB-backed content instead:
 * companies.program_phases for the agenda, and cohort name/description/company
 * name for the hero copy. See components/journey/RcplWorkspace.tsx.
 */
export default function PrepareClient({ initialData }: { initialData: JourneyData }) {
  const { personalPlanState } = useEngine();
  const [error, setError] = useState<string | null>(initialData.error ?? null);
  const [cohort, setCohort] = useState(initialData.cohort);
  const [roster, setRoster] = useState(initialData.roster);
  const [items, setItems] = useState(initialData.items);
  const [progress, setProgress] = useState<Record<string, UserPrepareProgress>>(
    Object.fromEntries(initialData.progress.map((item) => [item.contentItemId, item]))
  );
  const [notices, setNotices] = useState(initialData.notices);
  const [facilitators, setFacilitators] = useState(initialData.facilitators);
  const [selectedItem, setSelectedItem] = useState<PrepareContentItem | null>(null);

  usePageLoading(false);

  const reloadQuietly = useCallback(async () => {
    const result = await getJourneyData();
    setError(result.error ?? null);
    setCohort(result.cohort);
    setRoster(result.roster);
    setItems(result.items);
    setProgress(Object.fromEntries(result.progress.map((item) => [item.contentItemId, item])));
    setNotices(result.notices);
    setFacilitators(result.facilitators);
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

  const completedCount = items.filter((item) => progress[item.id]?.status === "completed").length;
  const preparationComplete = items.length === 0 || completedCount === items.length;
  const nextIncompleteItem = items.find((item) => progress[item.id]?.status !== "completed") ?? items[0] ?? null;
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
  if (!cohort) return <div className="journey-empty"><CircleUserRound size={32} /><strong>Your learning journey will appear here</strong><p>Ask your administrator to add you to a batch.</p></div>;

  const companyName = cohort.companyName?.trim().toLowerCase();
  const isSurge = companyName === "surge";

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
      notices={notices}
      facilitators={facilitators}
      {...(!isSurge && {
        phases: cohort.companyProgramPhases ?? [],
        programEyebrow: cohort.companyName ? `${cohort.companyName} Workspace` : "Your Workspace",
        heroTitle: cohort.name,
        heroDescription: cohort.description || "Turn what you learn into something useful in your work and career.",
      })}
    />
    {quizModal}
    {resourceModal}
  </>;
}
