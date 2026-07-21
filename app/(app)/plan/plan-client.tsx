"use client";

import { useState } from "react";
import { Sparkles, CheckCircle2, CalendarDays } from "lucide-react";
import { useEngine } from "@/lib/store";
import Onboarding from "@/components/Onboarding";
import GenerationStatus from "@/components/GenerationStatus";

export default function PlanClient({ initialTrainingText }: { initialTrainingText: string }) {
  const { selfOnboardingCompletedAt, generationJob, refetch, allActions } = useEngine();
  const [editing, setEditing] = useState(!selfOnboardingCompletedAt);
  const generatedCount = allActions.filter((action) => action.isPersonal).length;

  return (
    <div className="journey-page plan-page">
      {editing && <Onboarding initialTrainingText={initialTrainingText} onComplete={() => { setEditing(false); refetch(); }} />}
      <div className="participant-page-heading centered">
        <span className="participant-eyebrow">AI action planner</span>
        <h1>Turn learning into a practical plan</h1>
        <p>Use your session notes and priorities to create small workplace actions at a pace that fits your week.</p>
      </div>
      <div className="plan-summary-card">
        <div className="plan-summary-icon"><Sparkles size={24} /></div>
        <div>
          <span className="participant-eyebrow">Your practice plan</span>
          <h2>{selfOnboardingCompletedAt ? "Your plan is active" : "Build your first plan"}</h2>
          <p>{selfOnboardingCompletedAt ? `${generatedCount} personalised actions have been generated from your learning priorities.` : "Choose your focus, duration, action pace and reminder schedule."}</p>
        </div>
        <button className="journey-primary-button" onClick={() => setEditing(true)}>{selfOnboardingCompletedAt ? "Review plan settings" : "Build my plan"}</button>
      </div>
      {generationJob && <div className="journey-card"><GenerationStatus job={generationJob} /></div>}
      <div className="plan-benefits-grid">
        <div className="journey-card"><CheckCircle2 size={22} /><h3>Personal actions</h3><p>Generated around the skills and situations that matter to you.</p></div>
        <div className="journey-card"><CalendarDays size={22} /><h3>Your pace</h3><p>Choose the days, frequency and time that work with your schedule.</p></div>
      </div>
    </div>
  );
}
