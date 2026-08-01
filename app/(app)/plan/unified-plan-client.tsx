"use client";

import { useState } from "react";
import NotesClient from "../notes/notes-client";
import PlanClient from "./plan-client";

export default function UnifiedPlanClient({ initialTrainingText }: { initialTrainingText: string }) {
  const [trainingText, setTrainingText] = useState(initialTrainingText);

  return <>
    <NotesClient embedded onBodyChange={setTrainingText} />
    <PlanClient initialTrainingText={trainingText} embedded />
  </>;
}
