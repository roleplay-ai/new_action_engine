"use client";

import React, { useState } from "react";
import { useEngine } from "@/lib/store";
import ActionCard from "@/components/ActionCard";
import Challenges from "@/components/Challenges";
import Carousel from "@/components/Carousel";
import { X, Lightbulb, ArrowRight, ListChecks, ChevronDown, ChevronRight } from "lucide-react";
import ConfettiCelebration from "@/components/ConfettiCelebration";
import GenerationStatus from "@/components/GenerationStatus";
import { updatePersonalAction, deletePersonalAction } from "@/app/actions/ai-actions";
import { THEMES } from "@/lib/personal-action-generation";
import type { ActionTheme } from "@/lib/types";

type ValidationStep = "success_prompt" | "celebration";

const TIME_ESTIMATES = ["2 mins", "5 mins", "15 mins", "30 mins"];

export default function ActionPlanClient() {
  const {
    profile,
    userActions,
    allActions,
    completeAction,
    hasCompany,
    selfOnboardingCompletedAt,
    generationJob,
    refetch,
  } = useEngine();
  const [completingActionId, setCompletingActionId] = useState<string | null>(null);
  const [reflection, setReflection] = useState("");
  const [validationStep, setValidationStep] = useState<ValidationStep>("success_prompt");
  const [showLibrary, setShowLibrary] = useState(true);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ theme: ActionTheme; title: string; how: string; why: string; timeEstimate: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Actions are entirely self-generated (via the AI onboarding wizard) — no
  // admin-curated package delivery. Pacing (how many are active at once) is
  // decided server-side by assignScheduledBatch, not here — "My Actions" just
  // shows whatever currently has a "scheduled" user_actions row, so
  // completing one doesn't pull in a replacement until the next delivery.
  const scheduledIds = new Set(
    userActions.filter((ua) => ua.status === "scheduled").map((ua) => ua.actionId)
  );
  const myActions = allActions.filter((ad) => ad.isPersonal && scheduledIds.has(ad.id));

  const completingAction = completingActionId
    ? allActions.find((a) => a.id === completingActionId)
    : undefined;

  const openCompleteModal = (actionId: string) => {
    setCompletingActionId(actionId);
    setValidationStep("success_prompt");
    setReflection("");
  };

  const closeCompleteModal = () => {
    setCompletingActionId(null);
    setValidationStep("success_prompt");
    setReflection("");
  };

  const submitValidation = async () => {
    if (!completingActionId) return;
    setValidationStep("celebration");
    await completeAction(completingActionId, true, reflection);
  };

  const handleDidNotComplete = async () => {
    if (!completingActionId) return;
    await completeAction(completingActionId, false, reflection);
    closeCompleteModal();
  };

  const openEditModal = (actionId: string) => {
    const action = allActions.find((a) => a.id === actionId);
    if (!action) return;
    setEditingActionId(actionId);
    setEditForm({
      theme: action.theme,
      title: action.title,
      how: action.how,
      why: action.why,
      timeEstimate: action.timeEstimate,
    });
    setEditError(null);
  };

  const closeEditModal = () => {
    setEditingActionId(null);
    setEditForm(null);
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!editingActionId || !editForm) return;
    setSavingEdit(true);
    const { error } = await updatePersonalAction(editingActionId, editForm);
    setSavingEdit(false);
    if (error) {
      setEditError(error);
      return;
    }
    await refetch();
    closeEditModal();
  };

  const handleDeleteGenerated = async (actionId: string) => {
    await deletePersonalAction(actionId);
    await refetch();
  };

  const sectionTitle = "My Actions";

  return (
    <>
      {completingActionId && validationStep === "success_prompt" && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
          style={{ background: "rgba(34,29,35,0.65)", backdropFilter: "blur(12px)" }}
        >
          <div className="card card--wide animate-pop w-full overflow-y-auto no-scrollbar" style={{ maxHeight: "90vh" }}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="tag tag--yellow mb-3 inline-block">Check In</span>
                <h3 className="card__title">Mark as complete</h3>
                <p className="card__subtitle mb-0">
                  {completingAction?.title
                    ? `How did "${completingAction.title}" go?`
                    : "Capture your tactical reflection — this builds the knowing-doing bridge."}
                </p>
              </div>
              <button onClick={closeCompleteModal} className="btn btn--icon ml-4">
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            <div className="card__inset mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb size={16} style={{ color: "var(--bright-amber)" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>
                  What was the tactical result or friction point?
                </span>
              </div>
              <textarea
                placeholder="The team shared 3 ideas they'd usually hide..."
                className="form-input"
                style={{ minHeight: "140px", resize: "vertical" }}
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={submitValidation} className="btn btn--accept flex-1">
                Verify <ArrowRight size={18} strokeWidth={2.5} />
              </button>
              <button onClick={handleDidNotComplete} className="btn btn--decline flex-1">
                Didn&apos;t Complete
              </button>
            </div>
          </div>
        </div>
      )}

      {completingActionId && validationStep === "celebration" && (
        <ConfettiCelebration
          actionTitle={completingAction?.title}
          onContinue={closeCompleteModal}
          onClose={closeCompleteModal}
        />
      )}

      <div className="animate-in fade-in duration-700 w-full space-y-10">
        <div>
          <h1 className="text-4xl font-bold" style={{ color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>
            Hi {profile.name} 👋
          </h1>
          <p className="text-sm font-medium mt-3" style={{ color: "var(--color-text-secondary)" }}>
            Work through your actions and mark each one complete when you&apos;re done.
          </p>
        </div>

        <section>
          {!hasCompany ? (
            <div className="card card--flat text-center">
              <div className="icon-badge">🏢</div>
              <h3 className="card__title">Not assigned to a company</h3>
              <p className="card__subtitle mb-0">Contact your admin to get access to the Action Library.</p>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
                <div
                  style={{
                    width: 42, height: 42, borderRadius: "50%",
                    background: "var(--color-primary-light)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <ListChecks size={20} style={{ color: "var(--bright-amber)" }} strokeWidth={2.5} />
                </div>
                <div>
                  <h2
                    style={{
                      fontSize: "var(--text-2xl)", fontWeight: "var(--weight-bold)",
                      color: "var(--color-text-primary)", letterSpacing: "-0.02em",
                      lineHeight: 1.2, marginBottom: "4px",
                    }}
                  >
                    {sectionTitle}
                  </h2>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
                    {myActions.length > 0
                      ? `${myActions.length} action${myActions.length === 1 ? "" : "s"} ready — mark complete when done`
                      : "New actions will appear here on your sprint cadence"}
                  </p>
                </div>
              </div>

              <div className="my-actions-bleed">
                <Carousel wideSlides>
                  {myActions.map((action) => (
                    <ActionCard key={action.id} action={action} onMarkComplete={openCompleteModal} />
                  ))}
                </Carousel>
              </div>

              {generationJob && (
                <div className="card__inset mt-4" style={{ maxWidth: "360px" }}>
                  <GenerationStatus job={generationJob} />
                </div>
              )}
            </>
          )}
        </section>

        {hasCompany && (
          <section className="w-full min-w-0">
            <button
              onClick={() => setShowLibrary((v) => !v)}
              className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
              aria-expanded={showLibrary}
              aria-controls="full-action-library"
            >
              {showLibrary ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              Full action library
            </button>
            <div
              id="full-action-library"
              className="grid transition-[grid-template-rows] duration-200 ease-out"
              style={{ gridTemplateRows: showLibrary ? "1fr" : "0fr" }}
              aria-hidden={!showLibrary}
              inert={!showLibrary || undefined}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="mt-6">
                  <Challenges onEdit={openEditModal} onDelete={handleDeleteGenerated} />
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {editingActionId && editForm && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6"
          style={{ background: "rgba(34,29,35,0.55)" }}
          onClick={closeEditModal}
        >
          <div
            className="card animate-pop w-full flex flex-col"
            style={{ maxWidth: "520px", maxHeight: "min(90vh, 680px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h4 className="font-bold" style={{ color: "var(--color-text-primary)" }}>Edit action</h4>
              <button onClick={closeEditModal} className="btn btn--icon">
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>

            <div className="overflow-y-auto no-scrollbar flex flex-col gap-4 min-h-0 flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="form-group mb-0">
                  <label className="form-label">Theme</label>
                  <select
                    className="form-input"
                    style={{ fontSize: "var(--text-sm)" }}
                    value={editForm.theme}
                    onChange={(e) => setEditForm({ ...editForm, theme: e.target.value as ActionTheme })}
                  >
                    {THEMES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group mb-0">
                  <label className="form-label">Est. Time</label>
                  <select
                    className="form-input"
                    style={{ fontSize: "var(--text-sm)" }}
                    value={editForm.timeEstimate}
                    onChange={(e) => setEditForm({ ...editForm, timeEstimate: e.target.value })}
                  >
                    {TIME_ESTIMATES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group mb-0">
                <label className="form-label">What</label>
                <input
                  className="form-input"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                />
              </div>

              <div className="form-group mb-0">
                <label className="form-label">How</label>
                <textarea
                  className="form-input"
                  style={{ minHeight: "96px", resize: "vertical" }}
                  value={editForm.how}
                  onChange={(e) => setEditForm({ ...editForm, how: e.target.value })}
                />
              </div>

              <div className="form-group mb-0">
                <label className="form-label">Why</label>
                <textarea
                  className="form-input"
                  style={{ minHeight: "80px", resize: "vertical" }}
                  value={editForm.why}
                  onChange={(e) => setEditForm({ ...editForm, why: e.target.value })}
                />
              </div>

              {editError && (
                <p className="text-sm font-semibold" style={{ color: "var(--color-danger)" }}>{editError}</p>
              )}
            </div>

            <button
              onClick={saveEdit}
              disabled={savingEdit}
              className="btn btn--primary btn--full shrink-0 mt-4"
            >
              {savingEdit ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
