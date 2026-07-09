"use client";

import React, { useState } from "react";
import { EngineProvider, useEngine } from "@/lib/store";
import Layout from "@/components/Layout";
import ActionCard from "@/components/ActionCard";
import Analytics from "@/components/Analytics";
import Challenges from "@/components/Challenges";
import Nudgeboard from "@/components/Nudgeboard";
import Carousel from "@/components/Carousel";
import YourNudgeboardCard from "@/components/YourNudgeboardCard";
import {
  Zap,
  X,
  Lightbulb,
  ArrowRight,
} from "lucide-react";
import ConfettiCelebration from "@/components/ConfettiCelebration";
import RemindersPanel from "@/components/RemindersPanel";
import Onboarding from "@/components/Onboarding";

type ValidationStep = "success_prompt" | "celebration";

function DashboardContent() {
  const {
    profile,
    userActions,
    allActions,
    actionIdsInAssignedPackages,
    assignedPackageName,
    validateAction,
    hasCompany,
    selfOnboardingCompletedAt,
    refetch,
  } = useEngine();
  const [activeTab, setActiveTab] = useState<"home" | "challenges" | "progress">("home");
  const [validatingActionId, setValidatingActionId] = useState<string | null>(null);
  const [reflection, setReflection] = useState("");
  const [validationStep, setValidationStep] = useState<ValidationStep>("success_prompt");

  const now = new Date().toISOString();
  const allScheduledInQueue = userActions.filter((ua) => ua.status === "scheduled");
  const showValidationQueue = allScheduledInQueue.length > 0;
  const availableActions = allActions.filter(
    (ad) =>
      actionIdsInAssignedPackages.has(ad.id) &&
      !userActions.some((ua) => ua.actionId === ad.id)
  );

  const validatingUA = userActions.find((ua) => ua.id === validatingActionId);
  const validatingActionTitle = validatingUA
    ? allActions.find((a) => a.id === validatingUA.actionId)?.title
    : undefined;

  const openValidationModal = (userActionId: string) => {
    setValidatingActionId(userActionId);
    setValidationStep("success_prompt");
    setReflection("");
  };

  const closeValidationModal = () => {
    setValidatingActionId(null);
    setValidationStep("success_prompt");
    setReflection("");
  };

  const submitValidation = async () => {
    if (!validatingActionId) return;
    setValidationStep("celebration");
    validateAction(validatingActionId, true, reflection);
  };

  const handleDidNotComplete = async () => {
    if (!validatingActionId) return;
    await validateAction(validatingActionId, false, reflection);
    closeValidationModal();
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>

      {/* ═══════════════════════════════════════════════════
          SELF-SERVE AI ONBOARDING
      ═══════════════════════════════════════════════════ */}
      {hasCompany && !selfOnboardingCompletedAt && (
        <Onboarding onComplete={() => refetch()} />
      )}

      {/* ═══════════════════════════════════════════════════
          VALIDATION MODAL
      ═══════════════════════════════════════════════════ */}
      {validatingActionId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
          style={{ background: "rgba(34,29,35,0.65)", backdropFilter: "blur(12px)" }}>

          {/* ── STEP 1: Reflection ── */}
          {validationStep === "success_prompt" && (
            <div className="card card--wide animate-pop w-full overflow-y-auto no-scrollbar" style={{ maxHeight: "90vh" }}>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="tag tag--yellow mb-3 inline-block">Check In</span>
                  <h3 className="card__title">What was the result?</h3>
                  <p className="card__subtitle mb-0">
                    Capture your tactical reflection — this builds the knowing-doing bridge.
                  </p>
                </div>
                <button onClick={closeValidationModal} className="btn btn--icon ml-4">
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

          {/* ── STEP 2: Confetti Celebration ── */}
          {validationStep === "celebration" && (
            <div className="card--wide animate-pop w-full overflow-y-auto no-scrollbar" style={{ maxHeight: "90vh" }}>
              <ConfettiCelebration
                actionTitle={validatingActionTitle}
                onContinue={closeValidationModal}
                onClose={closeValidationModal}
              />
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          HOME TAB
      ═══════════════════════════════════════════════════ */}
      {activeTab === "home" && (
        <div className="grid grid-cols-12 gap-8 lg:gap-10 animate-in fade-in duration-700">
          <div className="col-span-12 lg:col-span-7 xl:col-span-8 space-y-14">

            {/* Greeting */}
            <div>
              {/* <p className="text-xs font-semibold mb-1" style={{ color: "var(--color-text-muted)", letterSpacing: "0.08em" }}>
                Strategic Mastery Engine
              </p> */}
              <div className="flex items-center gap-4">
                <h1 className="text-4xl font-bold" style={{ color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>
                  Hi {profile.name} 👋
                </h1>
              </div>
              <p className="text-sm font-medium mt-3" style={{ color: "var(--color-text-secondary)" }}>
                Accept the actions you like this week — there&apos;ll be new ones next week!
              </p>
            </div>

            {/* Package actions carousel */}
            <section style={{ marginTop: "2rem" }}>
              {!hasCompany ? (
                <div className="card card--flat text-center">
                  <div className="icon-badge">🏢</div>
                  <h3 className="card__title">Not assigned to a company</h3>
                  <p className="card__subtitle mb-0">
                    Contact your admin to get access to the Action Library.
                  </p>
                </div>
              ) : (
                <Carousel title={assignedPackageName ?? "My Actions"}>
                  {availableActions.map((action) => (
                    <ActionCard
                      key={action.id}
                      action={action}
                    />
                  ))}
                </Carousel>
              )}
            </section>

            {/* Validation Queue */}
            {showValidationQueue && (
              <section>
                {/* Heading */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: "50%",
                      background: "var(--color-primary-light)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      <Zap size={18} style={{ color: "var(--bright-amber)" }} strokeWidth={2.5} />
                    </div>
                    <div>
                      <h2 style={{
                        fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)",
                        color: "var(--color-text-primary)", letterSpacing: "-0.01em",
                        lineHeight: 1.2, marginBottom: "2px",
                      }}>
                        Validation Queue
                      </h2>
                      <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                        Verify your impact to bridge the gap
                      </p>
                    </div>
                  </div>
                </div>

                <div className="card" style={{ maxWidth: "none" }}>
                  <div className="max-h-[520px] overflow-y-auto custom-scrollbar space-y-3 pr-1">
                    {allScheduledInQueue.map((ua) => {
                      const action = allActions.find((a) => a.id === ua.actionId);
                      const canVerify =
                        (ua.scheduledAt && ua.scheduledAt <= now) ||
                        (!ua.scheduledAt && !!ua.acceptedAt);

                      return (
                        <div key={ua.id} className="card__inset flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`tag ${canVerify ? "tag--blue" : "tag--yellow"}`}>
                                {canVerify ? "Commitment" : "Planned"}
                              </span>
                              {action?.theme && (
                                <span className="tag tag--orange">{action.theme}</span>
                              )}
                            </div>
                            <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                              {action?.title}
                            </p>
                            {ua.scheduledAt ? (
                              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                                Scheduled for {ua.scheduledDate} at {ua.scheduledTime} IST
                              </p>
                            ) : ua.acceptedAt ? (
                              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                                Accepted on {ua.acceptedDate} at {ua.acceptedTime} IST
                              </p>
                            ) : null}
                          </div>
                          {canVerify ? (
                            <button
                              onClick={() => openValidationModal(ua.id)}
                              className="btn btn--primary btn--sm shrink-0"
                            >
                              Verify
                            </button>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                              Verify at scheduled time
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {/* This Week's Reminders */}
            <RemindersPanel />
          </div>

          {/* Sidebar */}
          <div className="hidden lg:block lg:col-span-5 xl:col-span-4">
            <YourNudgeboardCard onSeeProgress={() => setActiveTab("progress")} />
          </div>
        </div>
      )}

      {activeTab === "challenges" && <Challenges />}
      {activeTab === "progress" && <Analytics />}
    </Layout>
  );
}

export default function DashboardClient() {
  return (
    <EngineProvider>
      <DashboardContent />
    </EngineProvider>
  );
}
