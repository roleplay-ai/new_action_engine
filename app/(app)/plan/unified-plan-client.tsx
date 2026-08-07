"use client";

import { useCallback, useEffect, useState } from "react";
import NotesClient from "../notes/notes-client";
import PlanClient from "./plan-client";
import { useEngine } from "@/lib/store";

export default function UnifiedPlanClient({ initialTrainingText }: { initialTrainingText: string }) {
  const { personalPlanState, generationJob, allActions } = useEngine();
  const [trainingText, setTrainingText] = useState(initialTrainingText);
  const [reviewing, setReviewing] = useState(Boolean(initialTrainingText.trim()));
  const [showActionPlan, setShowActionPlan] = useState(false);
  const hasExistingPlan = personalPlanState !== "none"
    || Boolean(generationJob)
    || allActions.some((action) => action.isPersonal);

  useEffect(() => {
    if (hasExistingPlan) setShowActionPlan(true);
  }, [hasExistingPlan]);

  const goToPlan = (body?: string) => {
    if (typeof body === "string") setTrainingText(body);
    setShowActionPlan(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById("action-plan")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  };

  const handleReviewChange = useCallback((nextReviewing: boolean) => {
    setReviewing(nextReviewing);
    if (!nextReviewing && !hasExistingPlan) setShowActionPlan(false);
  }, [hasExistingPlan]);

  return <>
    <div className="participant-page-heading">
      <span className="participant-eyebrow">{reviewing ? "My Plan" : "Private workspace"}</span>
      <h1>{reviewing ? "Your Plan" : "My Plan"}</h1>
      <p>{reviewing ? "A clean, shareable version of what you wrote." : "Answer in your own words. This becomes your personal plan."}</p>
    </div>
    <NotesClient embedded onBodyChange={setTrainingText} onSavePlan={goToPlan} onReviewChange={handleReviewChange} />
    {(showActionPlan || hasExistingPlan) && <PlanClient initialTrainingText={trainingText} embedded />}
  </>;
}
