"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, CalendarDays, Check, CheckCircle2, GripVertical, ListChecks, Loader2, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { useEngine } from "@/lib/store";
import Onboarding from "@/components/Onboarding";
import GenerationStatus from "@/components/GenerationStatus";
import {
  activatePersonalActionPlan,
  deletePersonalAction,
  generateOneMorePersonalAction,
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

function projectedPlanPoints() {
  return 50;
}

export default function PlanClient({ initialTrainingText, embedded = false }: { initialTrainingText: string; embedded?: boolean }) {
  const router = useRouter();
  const {
    personalPlanState,
    hasArchivedPlans,
    cohort,
    generationJob,
    generationError,
    refreshGenerationStatus,
    refetch,
    allActions,
  } = useEngine();
  const [editingSetup, setEditingSetup] = useState(false);
  const [editingAction, setEditingAction] = useState<ActionCard | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [confirmActivateOpen, setConfirmActivateOpen] = useState(false);
  const [orderedActions, setOrderedActions] = useState<ActionCard[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [generatingMore, setGeneratingMore] = useState(false);
  const [scheduleSlots, setScheduleSlots] = useState<DraftPlanScheduleSlot[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [error, setError] = useState("");
  const generatedActions = allActions.filter((action) => action.isPersonal);
  const generatedActionKey = JSON.stringify(generatedActions.map((action) => [
    action.id,
    action.title,
    action.how,
    action.why,
    action.timeEstimate,
  ]));
  const isPlanActive = personalPlanState === "active";
  const isPlanArchived = personalPlanState === "archived";
  const hasDraft = personalPlanState === "draft" || (personalPlanState === "none" && (generatedActions.length > 0 || !!generationJob));
  const canBuildPlan = !!cohort?.isCurrent && personalPlanState === "none";
  const showInitialSetup = canBuildPlan && !hasDraft;

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
    setOrderedActions((current) => current.map((action) => (
      action.id === editingAction.id
        ? {
            ...action,
            title: editForm.title.trim(),
            how: editForm.how.trim(),
            why: editForm.why.trim(),
          }
        : action
    )));
    setEditingAction(null);
    setEditForm(null);
    await refetch();
  }

  async function removeAction(action: ActionCard) {
    if (!window.confirm(`Remove “${action.title}” from this plan?`)) return;
    const result = await deletePersonalAction(action.id);
    if (result.error) { setError(result.error); return; }
    await refetch();
  }

  async function saveOrder(nextActions: ActionCard[], previousActions: ActionCard[]) {
    if (savingOrder || generationJob || generatingMore) return;
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
    if (sourceId === targetId || savingOrder || generationJob || generatingMore) return;
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
    if (savingOrder || generationJob || generatingMore) return;
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
    if (result.error) {
      setError(result.error);
      return;
    }
    setConfirmActivateOpen(false);
    await refetch();
    router.push("/actions");
  }

  async function generateOneMore() {
    if (generatingMore || generationJob || savingOrder) return;
    setGeneratingMore(true);
    setError("");
    const result = await generateOneMorePersonalAction();
    setGeneratingMore(false);
    if (result.error) { setError(result.error); return; }
    await refetch();
  }

  function openPlanSetup() {
    if (!initialTrainingText.trim()) {
      document.getElementById("notes")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setEditingSetup(true);
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
          ? "Your saved notes will shape the plan. Choose only its duration, action pace and reminder schedule."
          : "Switch to your current cohort to build a new plan.";

  return <section className={`journey-page plan-page${embedded ? " unified-plan-section" : ""}`} id={embedded ? "action-plan" : undefined}>
    {embedded ? <div className="unified-plan-section-heading"><span className="participant-eyebrow">Step 2 · Build</span><h2>Your action plan</h2><p>Generate personalised workplace actions, review every suggestion, and activate them when they feel right.</p></div> : <div className="participant-page-heading"><span className="participant-eyebrow">Private workspace</span><h1>My Plan</h1><p>Shape what you want to build, review every suggested action, then activate the plan when it feels right.</p></div>}

    <div className="journey-v2-progress-pills" aria-label="Plan progress">
      <div className={hasDraft || isPlanActive || isPlanArchived ? "done" : "current"}><span>{hasDraft || isPlanActive || isPlanArchived ? <Check size={13} /> : 1}</span>My Plan</div>
      <div className={generatedActions.length > 0 ? "done" : hasDraft ? "current" : ""}><span>{generatedActions.length > 0 ? <Check size={13} /> : 2}</span>Actions generated</div>
      <div className={isPlanActive || isPlanArchived ? "done" : generatedActions.length > 0 ? "current" : ""}><span>{isPlanActive || isPlanArchived ? <Check size={13} /> : 3}</span>{isPlanActive ? "Active" : isPlanArchived ? "Archived" : "Activate"}</div>
    </div>

    {(showInitialSetup || editingSetup) && <Onboarding inline initialTrainingText={initialTrainingText} onComplete={async () => {
      setEditingSetup(false);
      await Promise.all([
        refetch(),
        refreshGenerationStatus({ refreshActions: false }),
      ]);
    }} />}

    {!showInitialSetup && !editingSetup && <div className="plan-summary-card"><div className="plan-summary-icon"><Sparkles size={24} /></div><div><span className="participant-eyebrow">{cohort?.name ?? "Your cohort"}</span><h2>{heading}</h2><p>{summary}</p></div>{!generationJob && !generationError && hasDraft && <button className="journey-primary-button" onClick={openPlanSetup}>Change pace</button>}</div>}

    {canBuildPlan && hasArchivedPlans && <div className="journey-card plan-history-notice"><strong>Your earlier cohort plans are safely archived.</strong><p>Use the cohort switcher above whenever you want to revisit earlier actions and complete any that remain.</p></div>}

    {generationJob && <div className="journey-card plan-generation-status" role="status"><GenerationStatus job={generationJob} /><p>Keep this page open or come back later. New actions will appear here automatically as each batch is ready.</p></div>}
    {hasDraft && generationError && !generationJob && <div className="journey-card plan-generation-error" role="alert"><div><X size={18} /><span><strong>Generation paused</strong><small>{generationError}</small></span></div><button type="button" onClick={openPlanSetup}>Try again</button></div>}

    {hasDraft && !editingSetup && <section className="plan-review-shell">
      <div className="plan-review-heading"><div><span className="participant-eyebrow">Review before finalising</span><h2>Your generated actions</h2><p>Move, rename or delete actions before activation. Daily plans begin on the next weekday; weekly plans begin on the next selected weekday.</p></div><strong>{savingOrder ? <><Loader2 size={12} className="plan-order-spinner" /> Saving order</> : `${generatedActions.length}${generationJob ? ` / ${generationJob.totalNeeded}` : ""} actions`}</strong></div>
      {!generationJob && orderedActions.length > 1 && <div className="plan-order-tip"><GripVertical size={17} /><span><strong>Set your preferred sequence</strong><small>Drag a card, or use its arrow buttons. Dates update with the new order.</small></span></div>}
      <div className="plan-review-list">
        {orderedActions.map((action, index) => {
          const schedule = formatScheduleSlot(scheduleSlots[index]);
          const locked = Boolean(generationJob) || savingOrder || generatingMore;
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
            <div className="plan-action-order" title="Drag to reorder">
              <div className="plan-action-number">{index + 1}</div>
            </div>
            <div className="plan-action-copy plan-action-copy--compact">
              <h3 title={action.title}>{action.title}</h3>
              <div className={`plan-action-meta${scheduleSlots[index]?.isImmediate ? " is-immediate" : ""}`}>
                <span title={scheduleLoading ? "Calculating schedule…" : schedule.detail}><CalendarDays size={13} />{scheduleLoading ? "Calculating…" : schedule.date}</span>
                <span>{projectedPlanPoints()} CP</span>
              </div>
            </div>
            <div className="plan-action-controls plan-action-controls--compact">
              <button type="button" onClick={() => nudgeAction(action.id, -1)} disabled={locked || index === 0} aria-label={`Move ${action.title} up`} title="Move up"><ArrowUp size={15} /></button>
              <button type="button" onClick={() => nudgeAction(action.id, 1)} disabled={locked || index === orderedActions.length - 1} aria-label={`Move ${action.title} down`} title="Move down"><ArrowDown size={15} /></button>
              <button type="button" disabled={locked} onClick={() => openEdit(action)} aria-label={`Edit ${action.title}`} title="Edit action"><Pencil size={15} /></button>
              <button type="button" disabled={locked} onClick={() => removeAction(action)} aria-label={`Delete ${action.title}`} title="Delete action"><Trash2 size={15} /></button>
            </div>
          </article>;
        })}
        {generatedActions.length === 0 && <div className="actions-inline-empty">Your first actions are being generated…</div>}
      </div>
      {!generationJob && !generationError && generatedActions.length > 0 && (
        <div className="plan-generate-more">
          <button
            type="button"
            className="plan-generate-more-button"
            disabled={generatingMore || savingOrder || activating}
            onClick={generateOneMore}
          >
            {generatingMore ? <><Loader2 size={15} className="plan-order-spinner" /> Generating…</> : <><Sparkles size={15} /> Generate 1 more</>}
          </button>
          <p>Need another option? Add one more AI suggestion, then rename or reorder it like the rest.</p>
        </div>
      )}
      {!generationJob && !generationError && generatedActions.length > 0 && <div className="plan-freeze-bar plan-freeze-bar--primary"><div><CheckCircle2 size={20} /><span><strong>Your plan is ready</strong><small>Review the actions above, then activate when you are happy with the plan.</small></span></div><button className="journey-primary-button" disabled={activating || savingOrder || generatingMore} onClick={() => { setError(""); setConfirmActivateOpen(true); }}>{activating ? "Activating…" : savingOrder ? "Saving order…" : generatingMore ? "Generating…" : "Activate My Plan"}</button></div>}
      {error && <p className="plan-review-error">{error}</p>}
    </section>}

    {isPlanActive && <div className="plan-active-callout"><div><Check size={20} /><span><strong>Your plan is live</strong><small>Current actions and future reminders are available on the Actions page.</small></span></div><Link href="/actions" className="journey-primary-button">View my actions</Link></div>}

    {isPlanArchived && <div className="plan-active-callout"><div><Check size={20} /><span><strong>Archived cohort plan</strong><small>This plan is view-only. Its reminder schedule will not release new actions.</small></span></div><Link href="/actions" className="journey-primary-button">Revisit remaining actions</Link></div>}

    {!isPlanActive && !isPlanArchived && !hasDraft && <div className="journey-card plan-empty-preview"><span><ListChecks size={34} /></span><h3>Your actions will appear here</h3><p>Choose a realistic pace above, then generate them from your saved notes.</p></div>}

    {typeof document !== "undefined" && editingAction && editForm && createPortal(<div className="plan-edit-overlay"><div className="plan-edit-modal"><button className="plan-edit-close" onClick={() => setEditingAction(null)}><X size={18} /></button><span className="participant-eyebrow">Edit action</span><h3>Edit your action</h3><label>Action title<input value={editForm.title} onChange={(event) => setEditForm((current) => current ? { ...current, title: event.target.value } : current)} /></label><div className="plan-edit-how-why"><label><span>How to do it</span><textarea value={editForm.how} onChange={(event) => setEditForm((current) => current ? { ...current, how: event.target.value } : current)} /></label><label><span>Why it works</span><textarea value={editForm.why} onChange={(event) => setEditForm((current) => current ? { ...current, why: event.target.value } : current)} /></label></div>{error && <p className="plan-review-error">{error}</p>}<button className="journey-primary-button" disabled={saving || !editForm.title.trim() || !editForm.how.trim() || !editForm.why.trim()} onClick={saveEdit}>{saving ? "Saving…" : "Save"}</button></div></div>, document.body)}

    {typeof document !== "undefined" && confirmActivateOpen && createPortal(
      <div
        className="plan-activate-overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !activating) setConfirmActivateOpen(false);
        }}
      >
        <section className="plan-activate-modal" role="dialog" aria-modal="true" aria-labelledby="plan-activate-title">
          <div className="plan-activate-title-row"><div className="plan-activate-icon" aria-hidden="true"><CheckCircle2 size={29} /></div><h2 id="plan-activate-title">One commitment before you begin</h2></div>
          <p>Your progress and rewards will be based on the actions you confirm as completed. We will not ask you to upload proof, so please confirm an action only when you have genuinely completed it.</p>
          <strong>This keeps your progress meaningful and the rewards fair for everyone.</strong>
          {error && <p className="plan-review-error">{error}</p>}
          <div className="plan-activate-actions">
            <button type="button" className="plan-activate-back" disabled={activating} onClick={() => setConfirmActivateOpen(false)}>Go back</button>
            <button type="button" className="journey-primary-button" disabled={activating} onClick={activatePlan}>
              {activating ? "Activating…" : "I agree and activate my actions"}
            </button>
          </div>
        </section>
      </div>,
      document.body,
    )}
  </section>;
}
