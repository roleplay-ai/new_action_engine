"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CalendarDays, Check, CheckCircle2, Clock3, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { useEngine } from "@/lib/store";
import Onboarding from "@/components/Onboarding";
import GenerationStatus from "@/components/GenerationStatus";
import { activatePersonalActionPlan, deletePersonalAction, updatePersonalAction } from "@/app/actions/ai-actions";
import type { ActionCard } from "@/lib/types";
import { usePageLoading } from "@/components/PageLoadingProvider";

type EditForm = { title: string; how: string; why: string };

export default function PlanClient({ initialTrainingText }: { initialTrainingText: string }) {
  const { personalPlanState, hasArchivedPlans, cohort, generationJob, refetch, allActions } = useEngine();
  const [editingSetup, setEditingSetup] = useState(false);
  const [editingAction, setEditingAction] = useState<ActionCard | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState("");
  const generatedActions = allActions.filter((action) => action.isPersonal);
  const isPlanActive = personalPlanState === "active";
  const isPlanArchived = personalPlanState === "archived";
  const hasDraft = personalPlanState === "draft" || (personalPlanState === "none" && (generatedActions.length > 0 || !!generationJob));
  const canBuildPlan = !!cohort?.isCurrent && personalPlanState === "none";

  // Server already fetched notes; engine data is ready once Layout clears isLoading.
  usePageLoading(false);

  function openEdit(action: ActionCard) {
    setEditingAction(action);
    setEditForm({ title: action.title, how: action.how, why: action.why });
    setError("");
  }

  async function saveEdit() {
    if (!editingAction || !editForm) return;
    setSaving(true);
    const result = await updatePersonalAction(editingAction.id, {
      title: editForm.title,
      how: editForm.how,
      why: editForm.why,
    });
    setSaving(false);
    if (result.error) { setError(result.error); return; }
    await refetch();
    setEditingAction(null);
    setEditForm(null);
  }

  async function removeAction(action: ActionCard) {
    if (!window.confirm(`Remove “${action.title}” from this plan?`)) return;
    const result = await deletePersonalAction(action.id);
    if (result.error) { setError(result.error); return; }
    await refetch();
  }

  async function activatePlan() {
    setActivating(true);
    setError("");
    const result = await activatePersonalActionPlan();
    setActivating(false);
    if (result.error) { setError(result.error); return; }
    await refetch();
  }

  const heading = isPlanActive
    ? "Your plan is active"
    : isPlanArchived
      ? "This earlier plan is archived"
      : hasDraft
        ? "Review your draft plan"
        : canBuildPlan
          ? "Build your plan for this cohort"
          : "No plan was created for this cohort";
  const summary = isPlanActive
    ? `${generatedActions.length} personalised actions are part of this cohort's read-only practice plan.`
    : isPlanArchived
      ? "Reminders are paused, but you can revisit this cohort and complete any remaining released actions."
      : hasDraft
        ? "Edit or remove any action before finalising. Nothing is scheduled until you activate the plan."
        : canBuildPlan
          ? "Choose your focus, duration, action pace and reminder schedule."
          : "Switch to your current cohort to build a new plan.";

  return <div className="journey-page plan-page">
    {editingSetup && <Onboarding initialTrainingText={initialTrainingText} onComplete={() => { setEditingSetup(false); refetch(); }} />}

    <div className="participant-page-heading centered"><span className="participant-eyebrow">AI action planner</span><h1>Turn learning into a practical plan</h1><p>Generate personalised workplace actions, review every suggestion, then activate the plan when it feels right.</p></div>

    <div className="plan-summary-card"><div className="plan-summary-icon"><Sparkles size={24} /></div><div><span className="participant-eyebrow">{cohort?.name ?? "Your cohort"}</span><h2>{heading}</h2><p>{summary}</p></div>{(hasDraft || canBuildPlan) && <button className="journey-primary-button" onClick={() => setEditingSetup(true)}>{hasDraft ? "Change setup" : "Build my plan"}</button>}</div>

    {canBuildPlan && hasArchivedPlans && <div className="journey-card plan-history-notice"><strong>Your earlier cohort plans are safely archived.</strong><p>Use the cohort switcher above whenever you want to revisit earlier actions and complete any that remain.</p></div>}

    {generationJob && <div className="journey-card plan-generation-status"><GenerationStatus job={generationJob} /><p>You can preview actions as they arrive. Editing unlocks when generation finishes.</p></div>}

    {hasDraft && <section className="plan-review-shell">
      <div className="plan-review-heading"><div><span className="participant-eyebrow">Review before finalising</span><h2>Your generated actions</h2><p>Check the wording and relevance of every action. You can edit or delete anything that does not fit.</p></div><strong>{generatedActions.length}{generationJob ? ` / ${generationJob.totalNeeded}` : ""} actions</strong></div>
      <div className="plan-review-list">
        {generatedActions.map((action, index) => <article className="plan-review-action" key={action.id}><div className="plan-action-number">{index + 1}</div><div className="plan-action-copy"><div><span>{action.theme}</span><em><Clock3 size={11} />{action.timeEstimate}</em></div><h3>{action.title}</h3><p>{action.how}</p><small>{action.why}</small></div><div className="plan-action-controls"><button disabled={!!generationJob} onClick={() => openEdit(action)}><Pencil size={15} />Edit</button><button disabled={!!generationJob} onClick={() => removeAction(action)}><Trash2 size={15} />Delete</button></div></article>)}
        {generatedActions.length === 0 && <div className="actions-inline-empty">Your first actions are being generated…</div>}
      </div>
      <div className="plan-freeze-bar"><div><CheckCircle2 size={20} /><span><strong>Ready to start?</strong><small>Finalising releases your first actions and starts the reminder schedule.</small></span></div><button className="journey-primary-button" disabled={!!generationJob || generatedActions.length === 0 || activating} onClick={activatePlan}>{activating ? "Activating…" : generationJob ? "Finish generating first" : "Finalise and start plan"}</button></div>
      {error && <p className="plan-review-error">{error}</p>}
    </section>}

    {isPlanActive && <div className="plan-active-callout"><div><Check size={20} /><span><strong>Your plan is live</strong><small>Current actions and future reminders are available on the Actions page.</small></span></div><Link href="/actions" className="journey-primary-button">View my actions</Link></div>}

    {isPlanArchived && <div className="plan-active-callout"><div><Check size={20} /><span><strong>Archived cohort plan</strong><small>This plan is view-only. Its reminder schedule will not release new actions.</small></span></div><Link href="/actions" className="journey-primary-button">Revisit remaining actions</Link></div>}

    {!isPlanActive && !isPlanArchived && !hasDraft && <div className="plan-benefits-grid"><div className="journey-card"><CheckCircle2 size={22} /><h3>Review everything</h3><p>Edit or delete every AI suggestion before your plan begins.</p></div><div className="journey-card"><CalendarDays size={22} /><h3>Your pace</h3><p>Choose the days, frequency and time that work with your schedule.</p></div></div>}

    {typeof document !== "undefined" && editingAction && editForm && createPortal(<div className="plan-edit-overlay"><div className="plan-edit-modal"><button className="plan-edit-close" onClick={() => setEditingAction(null)}><X size={18} /></button><span className="participant-eyebrow">Edit action</span><h3>Make this action yours</h3><label>Action title<input value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} /></label><div className="plan-edit-how-why"><span className="plan-edit-how-why-label">How and why</span><label><span>How to do it</span><textarea value={editForm.how} onChange={(event) => setEditForm({ ...editForm, how: event.target.value })} rows={3} /></label><label><span>Why it works</span><textarea value={editForm.why} onChange={(event) => setEditForm({ ...editForm, why: event.target.value })} rows={3} /></label></div>{error && <p className="plan-review-error">{error}</p>}<button className="journey-primary-button" disabled={saving || !editForm.title.trim()} onClick={saveEdit}>{saving ? "Saving…" : "Save changes"}</button></div></div>, document.body)}
  </div>;
}
