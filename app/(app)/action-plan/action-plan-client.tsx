"use client";

import React, { useState } from "react";
import { useEngine } from "@/lib/store";
import ActionCard from "@/components/ActionCard";
import Challenges from "@/components/Challenges";
import Carousel from "@/components/Carousel";
import { X, Lightbulb, ArrowRight, ListChecks, ChevronDown, ChevronRight } from "lucide-react";
import ConfettiCelebration from "@/components/ConfettiCelebration";
import Onboarding from "@/components/Onboarding";

type ValidationStep = "success_prompt" | "celebration";

export default function ActionPlanClient() {
  const {
    profile,
    userActions,
    allActions,
    completeAction,
    hasCompany,
    selfOnboardingCompletedAt,
    refetch,
  } = useEngine();
  const [completingActionId, setCompletingActionId] = useState<string | null>(null);
  const [reflection, setReflection] = useState("");
  const [validationStep, setValidationStep] = useState<ValidationStep>("success_prompt");
  const [showLibrary, setShowLibrary] = useState(false);

  // Actions are entirely self-generated (via the AI onboarding wizard) — no
  // admin-curated package delivery.
  const myActions = allActions.filter((ad) => {
    const ua = userActions.find((u) => u.actionId === ad.id);
    if (ua?.status === "scheduled") return true;
    if (ua) return false;
    return ad.isPersonal;
  });

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

  const sectionTitle = "My Actions";

  return (
    <>
      {hasCompany && !selfOnboardingCompletedAt && <Onboarding onComplete={() => refetch()} />}

      {completingActionId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
          style={{ background: "rgba(34,29,35,0.65)", backdropFilter: "blur(12px)" }}
        >
          {validationStep === "success_prompt" && (
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
          )}

          {validationStep === "celebration" && (
            <div className="card--wide animate-pop w-full overflow-y-auto no-scrollbar" style={{ maxHeight: "90vh" }}>
              <ConfettiCelebration
                actionTitle={completingAction?.title}
                onContinue={closeCompleteModal}
                onClose={closeCompleteModal}
              />
            </div>
          )}
        </div>
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
            </>
          )}
        </section>

        {hasCompany && (
          <section>
            <button
              onClick={() => setShowLibrary((v) => !v)}
              className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              {showLibrary ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              Full action library
            </button>
            {showLibrary && (
              <div className="mt-6">
                <Challenges />
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}
