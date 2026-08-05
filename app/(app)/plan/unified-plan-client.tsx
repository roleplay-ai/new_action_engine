"use client";

import { useState } from "react";
import NotesClient from "../notes/notes-client";
import PlanClient from "./plan-client";

export default function UnifiedPlanClient({ initialTrainingText }: { initialTrainingText: string }) {
  const [trainingText, setTrainingText] = useState(initialTrainingText);
  const [activeStep, setActiveStep] = useState<1 | 2>(1);

  const openPlan = (body?: string) => {
    if (typeof body === "string") setTrainingText(body);
    setActiveStep(2);
  };

  return <>
    <div className="unified-plan-tabs" role="tablist" aria-label="Plan steps">
      <button type="button" role="tab" aria-selected={activeStep === 1} aria-controls="plan-step-notes" className={activeStep === 1 ? "active" : ""} onClick={() => setActiveStep(1)}><span>1</span><strong>My notes</strong><small>Reflect and write</small></button>
      <button type="button" role="tab" aria-selected={activeStep === 2} aria-controls="plan-step-actions" className={activeStep === 2 ? "active" : ""} onClick={() => openPlan()}><span>2</span><strong>My plan</strong><small>Generate and review</small></button>
    </div>
    <div id="plan-step-notes" role="tabpanel" hidden={activeStep !== 1}>
      <NotesClient embedded onBodyChange={setTrainingText} onGeneratePlan={openPlan} />
    </div>
    <div id="plan-step-actions" role="tabpanel" hidden={activeStep !== 2}>
      <PlanClient initialTrainingText={trainingText} embedded />
    </div>
  </>;
}
