"use client";

import { useState } from "react";
import NotesClient from "../notes/notes-client";
import PlanClient from "./plan-client";

export default function UnifiedPlanClient({ initialTrainingText }: { initialTrainingText: string }) {
  const [trainingText, setTrainingText] = useState(initialTrainingText);

  const goToPlan = (body?: string) => {
    if (typeof body === "string") setTrainingText(body);
    window.requestAnimationFrame(() => {
      document.getElementById("action-plan")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return <>
    <NotesClient embedded onBodyChange={setTrainingText} onSavePlan={goToPlan} />
    <PlanClient initialTrainingText={trainingText} embedded />
  </>;
}
