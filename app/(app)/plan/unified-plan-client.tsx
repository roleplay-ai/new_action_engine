"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NotesClient, { type NotesClientHandle } from "../notes/notes-client";
import PlanClient from "./plan-client";
import { useEngine } from "@/lib/store";

export default function UnifiedPlanClient({ initialTrainingText }: { initialTrainingText: string }) {
  const { personalPlanState, generationJob, allActions } = useEngine();
  const [trainingText, setTrainingText] = useState(initialTrainingText);
  const [reviewing, setReviewing] = useState(Boolean(initialTrainingText.trim()));
  const [showActionPlan, setShowActionPlan] = useState(false);
  const notesRef = useRef<NotesClientHandle>(null);
  const planLocked = personalPlanState === "active" || personalPlanState === "archived";
  const hasExistingPlan = personalPlanState !== "none"
    || Boolean(generationJob)
    || allActions.some((action) => action.isPersonal);

  useEffect(() => {
    if (hasExistingPlan) setShowActionPlan(true);
  }, [hasExistingPlan]);

  const goToPlan = (body?: string) => {
    if (planLocked) return;
    if (typeof body === "string") setTrainingText(body);
    setShowActionPlan(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById("action-plan")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  };

  // Clicking "Generate My Actions" scrolls the reviewer out of view to reveal the
  // pace-setup step, which made editing feel unreachable. This puts the reviewer
  // back into edit mode and scrolls back up to it on demand.
  const editNotes = useCallback(() => {
    if (planLocked) return;
    notesRef.current?.editPlan();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById("notes")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }, [planLocked]);

  const handleReviewChange = useCallback((nextReviewing: boolean) => {
    if (planLocked) {
      setReviewing(true);
      return;
    }
    setReviewing(nextReviewing);
    if (!nextReviewing && !hasExistingPlan) setShowActionPlan(false);
  }, [hasExistingPlan, planLocked]);

  const showReviewCopy = reviewing || planLocked;

  return <>
    <div className="participant-page-heading">
      <h1>My Plan</h1>
      <p>{planLocked
        ? "This plan is finalised and can no longer be edited."
        : showReviewCopy
          ? "A clean, shareable version of what you wrote."
          : "Answer in your own words. This becomes my personal plan."}</p>
    </div>
    <NotesClient ref={notesRef} embedded hideFooter={showActionPlan} onBodyChange={setTrainingText} onSavePlan={goToPlan} onReviewChange={handleReviewChange} />
    {(showActionPlan || hasExistingPlan) && <PlanClient initialTrainingText={trainingText} embedded onEditNotes={editNotes} />}
  </>;
}
