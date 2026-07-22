"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowDown, ArrowUp, CalendarDays, Check, CheckCircle2, Clock3, GripVertical, Loader2, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { useEngine } from "@/lib/store";
import Onboarding from "@/components/Onboarding";
import GenerationStatus from "@/components/GenerationStatus";
import {
  activatePersonalActionPlan,
  deletePersonalAction,
  getDraftPlanSchedule,
  reorderPersonalActions,
  updatePersonalAction,
  type DraftPlanScheduleSlot,
} from "@/app/actions/ai-actions";
import type { ActionCard } from "@/lib/types";
import { usePageLoading } from "@/components/PageLoadingProvider";

type EditForm = { title: string; how: string; why: string };

function formatScheduleSlot(slot: DraftPlanScheduleSlot | undefined) {
  if (!slot) return { date: "Date calculating…", detail: "Plan schedule" };
  const value = new Date(slot.plannedAt);
  const date = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
  if (slot.isImmediate) return { date, detail: "Available immediately after finalising" };
  const time = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(value);
  return { date, detail: `${time} IST · planned release ${slot.batchNumber}` };
}

export default function PlanClient({ initialTrainingText }: { initialTrainingText: string }) {
  const { personalPlanState, hasArchivedPlans, cohort, generationJob, refetch, allActions } = useEngine();
  const [editingSetup, setEditingSetup] = useState(false);
  const [editingAction, setEditingAction] = useState<ActionCard | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [orderedActions, setOrderedActions] = useState<ActionCard[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [scheduleSlots, setScheduleSlots] = useState<DraftPlanScheduleSlot[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [error, setError] = useState("");
  const generatedActions = allActions.filter((action) => action.isPersonal);
  const generatedActionKey = generatedActions.map((action) => action.id).join("|");
  const isPlanActive = personalPlanState === "active";
  const isPlanArchived = personalPlanState === "archived";
  const hasDraft = personalPlanState === "draft" || (personalPlanState === "none" && (generatedActions.length > 0 || !!generationJob));
  const canBuildPlan = !!cohort?.isCurrent && personalPlanState === "none";

  useEffect(() => {
    setOrderedActions(generatedActions);
  // IDs capture additions/removals and the server-sorted order after a refetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedActionKey]);

  useEffect(() => {
    if (!hasDraft) {
      setScheduleSlots([]);
      return;
    }
    let cancelled = false;
    setScheduleLoading(true);
    void getDraftPlanSchedule().then((result) => {
      if (cancelled) return;
      setScheduleLoading(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setScheduleSlots(result.slots);
    });
    return () => { cancelled = true; };
  }, [hasDraft, generatedActionKey]);

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

  async function saveOrder(nextActions: ActionCard[], previousActions: ActionCard[]) {
    if (savingOrder || generationJob) return;
    setOrderedActions(nextActions);
    setSavingOrder(true);
    setError("");
    const result = await reorderPersonalActions(nextActions.map((action) => action.id));
    setSavingOrder(false);
    if (result.error) {
      setOrderedActions(previousActions);
      setError(result.error);
      return;
    }
    await refetch();
  }

  function moveAction(sourceId: string, targetId: string) {
    if (sourceId === targetId || savingOrder || generationJob) return;
    const previous = [...orderedActions];
    const sourceIndex = previous.findIndex((action) => action.id === sourceId);
    const targetIndex = previous.findIndex((action) => action.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...previous];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    void saveOrder(next, previous);
  }

  function nudgeAction(actionId: string, direction: -1 | 1) {
    if (savingOrder || generationJob) return;
    const currentIndex = orderedActions.findIndex((action) => action.id === actionId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedActions.length) return;
    const previous = [...orderedActions];
    const next = [...previous];
    [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
    void saveOrder(next, previous);
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
        ? "Drag actions into your preferred order, check their planned dates, and edit or remove anything before finalising."
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
      <div className="plan-review-heading"><div><span className="participant-eyebrow">Review before finalising</span><h2>Your generated actions</h2><p>Drag actions to change their priority. The first actions are released immediately; later dates follow your chosen reminder schedule.</p></div><strong>{savingOrder ? <><Loader2 size={12} className="plan-order-spinner" /> Saving order</> : `${generatedActions.length}${generationJob ? ` / ${generationJob.totalNeeded}` : ""} actions`}</strong></div>
      {!generationJob && orderedActions.length > 1 && <div className="plan-order-tip"><GripVertical size={17} /><span><strong>Set your preferred sequence</strong><small>Drag a card, or use its arrow buttons. Dates update with the new order.</small></span></div>}
      <div className="plan-review-list">
        {orderedActions.map((action, index) => {
          const schedule = formatScheduleSlot(scheduleSlots[index]);
          const locked = Boolean(generationJob) || savingOrder;
          return <article
            className={`plan-review-action plan-review-action--reorderable${draggedId === action.id ? " is-dragging" : ""}${dragOverId === action.id ? " is-drag-over" : ""}`}
            key={action.id}
            draggable={!locked}
            onDragStart={(event) => {
              if (locked) { event.preventDefault(); return; }
              setDraggedId(action.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", action.id);
            }}
            onDragEnter={() => { if (draggedId && draggedId !== action.id) setDragOverId(action.id); }}
            onDragOver={(event) => { if (draggedId) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
            onDrop={(event) => {
              event.preventDefault();
              const sourceId = draggedId || event.dataTransfer.getData("text/plain");
              setDraggedId(null);
              setDragOverId(null);
              if (sourceId) moveAction(sourceId, action.id);
            }}
            onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
          >
            <div className="plan-action-order">
              <span className="plan-drag-handle" title="Drag to reorder"><GripVertical size={17} /></span>
              <div className="plan-action-number">{index + 1}</div>
              <span className="plan-order-arrows">
                <button type="button" onClick={() => nudgeAction(action.id, -1)} disabled={locked || index === 0} aria-label={`Move ${action.title} up`}><ArrowUp size={12} /></button>
                <button type="button" onClick={() => nudgeAction(action.id, 1)} disabled={locked || index === orderedActions.length - 1} aria-label={`Move ${action.title} down`}><ArrowDown size={12} /></button>
              </span>
            </div>
            <div className="plan-action-copy">
              <div><span>{action.theme}</span><em><Clock3 size={11} />{action.timeEstimate}</em></div>
              <div className={`plan-action-date${scheduleSlots[index]?.isImmediate ? " is-immediate" : ""}`}><CalendarDays size={14} /><span><strong>{schedule.date}</strong><small>{scheduleLoading ? "Calculating schedule…" : schedule.detail}</small></span></div>
              <h3>{action.title}</h3><p>{action.how}</p><small>{action.why}</small>
            </div>
            <div className="plan-action-controls"><button disabled={locked} onClick={() => openEdit(action)}><Pencil size={15} />Edit</button><button disabled={locked} onClick={() => removeAction(action)}><Trash2 size={15} />Delete</button></div>
          </article>;
        })}
        {generatedActions.length === 0 && <div className="actions-inline-empty">Your first actions are being generated…</div>}
      </div>
      <div className="plan-freeze-bar"><div><CheckCircle2 size={20} /><span><strong>Ready to start?</strong><small>Finalising locks this order, releases your first actions and starts the reminder schedule.</small></span></div><button className="journey-primary-button" disabled={!!generationJob || generatedActions.length === 0 || activating || savingOrder} onClick={activatePlan}>{activating ? "Activating…" : savingOrder ? "Saving order…" : generationJob ? "Finish generating first" : "Finalise and start plan"}</button></div>
      {error && <p className="plan-review-error">{error}</p>}
    </section>}

    {isPlanActive && <div className="plan-active-callout"><div><Check size={20} /><span><strong>Your plan is live</strong><small>Current actions and future reminders are available on the Actions page.</small></span></div><Link href="/actions" className="journey-primary-button">View my actions</Link></div>}

    {isPlanArchived && <div className="plan-active-callout"><div><Check size={20} /><span><strong>Archived cohort plan</strong><small>This plan is view-only. Its reminder schedule will not release new actions.</small></span></div><Link href="/actions" className="journey-primary-button">Revisit remaining actions</Link></div>}

    {!isPlanActive && !isPlanArchived && !hasDraft && <div className="plan-benefits-grid"><div className="journey-card"><CheckCircle2 size={22} /><h3>Review everything</h3><p>Edit or delete every AI suggestion before your plan begins.</p></div><div className="journey-card"><CalendarDays size={22} /><h3>Your pace</h3><p>Choose the days, frequency and time that work with your schedule.</p></div></div>}

    {typeof document !== "undefined" && editingAction && editForm && createPortal(<div className="plan-edit-overlay"><div className="plan-edit-modal"><button className="plan-edit-close" onClick={() => setEditingAction(null)}><X size={18} /></button><span className="participant-eyebrow">Edit action</span><h3>Make this action yours</h3><label>Action title<input value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} /></label><div className="plan-edit-how-why"><span className="plan-edit-how-why-label">How and why</span><label><span>How to do it</span><textarea value={editForm.how} onChange={(event) => setEditForm({ ...editForm, how: event.target.value })} rows={3} /></label><label><span>Why it works</span><textarea value={editForm.why} onChange={(event) => setEditForm({ ...editForm, why: event.target.value })} rows={3} /></label></div>{error && <p className="plan-review-error">{error}</p>}<button className="journey-primary-button" disabled={saving || !editForm.title.trim()} onClick={saveEdit}>{saving ? "Saving…" : "Save changes"}</button></div></div>, document.body)}
  </div>;
}
