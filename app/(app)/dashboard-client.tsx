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
  Trophy,
  RefreshCw,
  Check,
  CalendarDays,
  Sparkles,
} from "lucide-react";
import ConfettiCelebration from "@/components/ConfettiCelebration";
import RocketLaunchIcon from "@/components/RocketLaunchIcon";

type ValidationStep = "success_prompt" | "celebration" | "habit_nudge" | "scheduling" | "rocket";
type HabitTrack = "daily" | "weekly";

function DashboardContent() {
  const {
    profile,
    userActions,
    allActions,
    actionIdsInAssignedPackages,
    assignedPackageName,
    validateAction,
    scheduleHabitLoop,
    habitOccurrences,
    hasCompany,
  } = useEngine();
  const [activeTab, setActiveTab] = useState<"home" | "challenges" | "progress">("home");
  const [validatingActionId, setValidatingActionId] = useState<string | null>(null);
  const [reflection, setReflection] = useState("");
  const [validationStep, setValidationStep] = useState<ValidationStep>("success_prompt");
  const [habitTrack, setHabitTrack] = useState<HabitTrack>("daily");
  const [habitTimeIST, setHabitTimeIST] = useState("09:00");
  const [habitWeekday, setHabitWeekday] = useState(1);
  const [isFirstHabitFlow, setIsFirstHabitFlow] = useState(false);

  const now = new Date().toISOString();
  const allScheduledInQueue = userActions.filter((ua) => ua.status === "scheduled");
  const readyToVerify = allScheduledInQueue.filter(
    (ua) => (ua.scheduledAt && ua.scheduledAt <= now) || (!ua.scheduledAt && ua.acceptedAt)
  );
  const habitsInProgress = userActions.filter((ua) => ua.status === "habit_started");
  const cementedHabits = userActions.filter((ua) => ua.status === "cemented");
  const habitOccurrenceUserActionIds = new Set(habitOccurrences.map((o) => o.userActionId));
  const habitsForCarousel = [...habitsInProgress, ...cementedHabits].filter((ua) =>
    habitOccurrenceUserActionIds.has(ua.id)
  );
  const habitUserActionIds = new Set(habitsInProgress.map((ua) => ua.id));
  const habitOccurrencesInQueue = habitOccurrences.filter((occ) =>
    habitUserActionIds.has(occ.userActionId)
  );
  const showValidationQueue =
    allScheduledInQueue.length > 0 || habitOccurrencesInQueue.length > 0;
  const availableActions = allActions.filter(
    (ad) =>
      actionIdsInAssignedPackages.has(ad.id) &&
      !userActions.some((ua) => ua.actionId === ad.id)
  );

  const validatingUA = userActions.find((ua) => ua.id === validatingActionId);
  const validatingActionTitle = validatingUA
    ? allActions.find((a) => a.id === validatingUA.actionId)?.title
    : undefined;

  const openHabitLoopModal = (userActionId: string) => {
    const ua = userActions.find((a) => a.id === userActionId);
    const first = ua ? ua.status !== "habit_started" && ua.status !== "cemented" : true;
    setIsFirstHabitFlow(first);
    setValidatingActionId(userActionId);
    setValidationStep("success_prompt");
    setHabitTrack("daily");
    setHabitTimeIST(ua?.scheduledTime ?? ua?.acceptedTime ?? "09:00");
    setHabitWeekday(1);
    setReflection("");
  };

  const closeHabitLoopModal = () => {
    setValidatingActionId(null);
    setValidationStep("success_prompt");
    setReflection("");
    setIsFirstHabitFlow(false);
  };

  const submitValidation = async () => {
    if (!validatingActionId) return;
    setValidationStep("celebration");
    validateAction(validatingActionId, true, reflection);
  };

  const onCelebrationContinue = () => {
    if (isFirstHabitFlow) {
      setValidationStep("habit_nudge");
    } else {
      closeHabitLoopModal();
    }
  };

  const handleDidNotComplete = async () => {
    if (!validatingActionId) return;
    await validateAction(validatingActionId, false, reflection);
    closeHabitLoopModal();
  };

  const startHabitFlow = () => setValidationStep("scheduling");

  const finalizeHabit = () => {
    if (!validatingActionId) { closeHabitLoopModal(); return; }
    const timeIST = habitTimeIST?.trim() || "09:00";
    const weekday = habitTrack === "weekly" ? habitWeekday : undefined;
    setValidationStep("rocket");
    scheduleHabitLoop(validatingActionId, habitTrack, timeIST, weekday);
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>

      {/* ═══════════════════════════════════════════════════
          HABIT LOOP / VALIDATION MODAL
      ═══════════════════════════════════════════════════ */}
      {validatingActionId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
          style={{ background: "rgba(34,29,35,0.65)", backdropFilter: "blur(12px)" }}>

          {/* ── STEP 1: Reflection ── */}
          {validationStep === "success_prompt" && (
            <div className="card card--wide animate-pop w-full overflow-y-auto no-scrollbar" style={{ maxHeight: "90vh" }}>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="tag tag--yellow mb-3 inline-block">Rep Logged!</span>
                  <h3 className="card__title">What was the result?</h3>
                  <p className="card__subtitle mb-0">
                    Capture your tactical reflection — this builds the knowing-doing bridge.
                  </p>
                </div>
                <button onClick={closeHabitLoopModal} className="btn btn--icon ml-4">
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
                  Verify Rep <ArrowRight size={18} strokeWidth={2.5} />
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
                onContinue={onCelebrationContinue}
                onClose={closeHabitLoopModal}
                isHabitFlow={isFirstHabitFlow}
              />
            </div>
          )}

          {/* ── STEP 3: Habit nudge ── */}
          {isFirstHabitFlow && validationStep === "habit_nudge" && (
            <div className="card card--wide animate-pop text-center w-full overflow-y-auto no-scrollbar" style={{ maxHeight: "90vh" }}>
              <div className="flex justify-end mb-2">
                <button onClick={closeHabitLoopModal} className="btn btn--icon">
                  <X size={20} strokeWidth={2.5} />
                </button>
              </div>

              {/* Trophy */}
              <div className="relative flex justify-center mb-8">
                <div
                  className="w-28 h-28 rounded-full flex items-center justify-center shadow-lg"
                  style={{ background: "var(--emerald)" }}
                >
                  <Trophy size={64} strokeWidth={1.5} style={{ color: "var(--white)" }} />
                </div>
              </div>

              <h3 className="card__title mb-2">1 success down.</h3>
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="h-1 w-10 rounded-full" style={{ background: "var(--bright-amber)" }} />
                <span className="text-lg font-bold" style={{ color: "var(--bright-amber)" }}>
                  4 reps to cement
                </span>
                <div className="h-1 w-10 rounded-full" style={{ background: "var(--bright-amber)" }} />
              </div>
              <p className="text-sm mb-8" style={{ color: "var(--color-text-muted)", lineHeight: "var(--leading-relaxed)" }}>
                The &quot;Rule of 5&quot; is a behavioral law: Complete 4 more repetitions to turn this micro-action into an automated habit.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button onClick={startHabitFlow} className="btn btn--primary btn--lg">
                  <RefreshCw size={20} strokeWidth={2.5} /> Start Habit Loop
                </button>
                <button onClick={closeHabitLoopModal} className="btn btn--decline btn--lg">
                  Finish for today
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 4: Track Selector ── */}
          {isFirstHabitFlow && validationStep === "scheduling" && (
            <div className="card card--wide animate-pop w-full overflow-y-auto no-scrollbar" style={{ maxHeight: "90vh" }}>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="tag tag--yellow mb-3 inline-block">Habit Loop</span>
                  <h3 className="card__title">Commit to a track</h3>
                  <p className="card__subtitle mb-0">Select your habit maintenance rhythm.</p>
                </div>
                <button onClick={closeHabitLoopModal} className="btn btn--icon ml-4">
                  <X size={20} strokeWidth={2.5} />
                </button>
              </div>

              {/* Track cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {/* Daily */}
                <button
                  onClick={() => setHabitTrack("daily")}
                  className={`card__inset text-left transition-all ${habitTrack === "daily" ? "ring-2 ring-offset-2" : "opacity-70 hover:opacity-100"}`}
                  style={habitTrack === "daily" ? { "--tw-ring-color": "var(--bright-amber)", borderColor: "var(--color-border-yellow)" } as React.CSSProperties : {}}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="icon-badge icon-badge--sm" style={{ marginBottom: 0 }}>
                      <Zap size={20} style={{ color: habitTrack === "daily" ? "var(--bright-amber)" : "var(--color-text-muted)" }} />
                    </div>
                    {habitTrack === "daily" && <span className="tag tag--featured">Selected</span>}
                  </div>
                  <h5 className="font-bold mb-1" style={{ color: "var(--color-text-primary)" }}>Daily Sprint</h5>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    Execute 5 days in a row for maximum neuroplasticity.
                  </p>
                  <ul className="mt-3 space-y-1">
                    {["Accelerated learning", "High intensity"].map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                        <Check size={12} strokeWidth={3} style={{ color: "var(--emerald)" }} /> {f}
                      </li>
                    ))}
                  </ul>
                </button>

                {/* Weekly */}
                <button
                  onClick={() => setHabitTrack("weekly")}
                  className={`card__inset text-left transition-all ${habitTrack === "weekly" ? "ring-2 ring-offset-2" : "opacity-70 hover:opacity-100"}`}
                  style={habitTrack === "weekly" ? { borderColor: "var(--color-border-yellow)" } : {}}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="icon-badge icon-badge--sm" style={{ marginBottom: 0 }}>
                      <CalendarDays size={20} style={{ color: habitTrack === "weekly" ? "var(--majorelle-blue)" : "var(--color-text-muted)" }} />
                    </div>
                    {habitTrack === "weekly" && <span className="tag tag--featured">Selected</span>}
                  </div>
                  <h5 className="font-bold mb-1" style={{ color: "var(--color-text-primary)" }}>Weekly Rhythm</h5>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    Execute 1 rep per week for sustainable lifestyle integration.
                  </p>
                  <ul className="mt-3 space-y-1">
                    {["Low friction", "Consistent presence"].map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                        <Check size={12} strokeWidth={3} style={{ color: "var(--emerald)" }} /> {f}
                      </li>
                    ))}
                  </ul>
                </button>
              </div>

              {/* Time picker */}
              <div className="form-group mb-4">
                <label className="form-label">
                  {habitTrack === "daily" ? "What time each day? (IST)" : "What time each week? (IST)"}
                </label>
                <input
                  type="time"
                  value={habitTimeIST}
                  onChange={(e) => setHabitTimeIST(e.target.value || "09:00")}
                  className="form-input"
                />
              </div>

              {/* Weekday picker */}
              {habitTrack === "weekly" && (
                <div className="form-group mb-6">
                  <label className="form-label">Which day of the week?</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 0, label: "Sun" },
                      { value: 1, label: "Mon" },
                      { value: 2, label: "Tue" },
                      { value: 3, label: "Wed" },
                      { value: 4, label: "Thu" },
                      { value: 5, label: "Fri" },
                      { value: 6, label: "Sat" },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setHabitWeekday(value)}
                        className={`btn btn--sm ${habitWeekday === value ? "btn--primary" : "btn--decline"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={finalizeHabit} className="btn btn--primary btn--full btn--lg">
                Lock in Commitment <Sparkles size={18} strokeWidth={2.5} />
              </button>
            </div>
          )}

          {/* ── STEP 5: Rocket Launch ── */}
          {validationStep === "rocket" && (
            <div className="card--wide animate-pop w-full overflow-y-auto no-scrollbar" style={{ maxHeight: "90vh" }}>
              <RocketLaunchIcon onClose={closeHabitLoopModal} />
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
                      const isHabit = ua.status === "habit_started";
                      const canVerify =
                        isHabit ||
                        (ua.scheduledAt && ua.scheduledAt <= now) ||
                        (!ua.scheduledAt && !!ua.acceptedAt);

                      return (
                        <div key={ua.id} className="card__inset flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`tag ${isHabit ? "tag--purple" : canVerify ? "tag--blue" : "tag--yellow"}`}>
                                {isHabit ? "Habit Loop" : canVerify ? "Commitment" : "Planned"}
                              </span>
                              {action?.theme && (
                                <span className="tag tag--orange">{action.theme}</span>
                              )}
                            </div>
                            <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                              {action?.title}
                            </p>
                            {isHabit && ua.habitRepsRemaining !== undefined && (
                              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                                {ua.habitRepsRemaining} reps to cement
                              </p>
                            )}
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
                              onClick={() => openHabitLoopModal(ua.id)}
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

                    {habitOccurrencesInQueue.map((occ) => {
                      const action = allActions.find((a) => a.id === occ.actionId);
                      const canVerifyOcc = occ.scheduledAt <= now;
                      return (
                        <div key={occ.id} className="card__inset flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="tag tag--orange">Habit rep</span>
                              {action?.theme && (
                                <span className="tag tag--yellow">{action.theme}</span>
                              )}
                            </div>
                            <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                              {action?.title}
                            </p>
                            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                              Scheduled for {occ.scheduledDate} at {occ.scheduledTime} IST
                            </p>
                          </div>
                          {canVerifyOcc ? (
                            <button
                              onClick={() => openHabitLoopModal(occ.userActionId)}
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

            {/* Habit Loop carousel */}
            {habitsForCarousel.length > 0 && (
              <section>
                <Carousel title="Habit Loop">
                  {habitsForCarousel.map((ua) => {
                    const action = allActions.find((a) => a.id === ua.actionId);
                    const totalReps = 5;
                    const isCemented = ua.status === "cemented";
                    const completed = isCemented ? 5 : (ua.completedReps ?? 0);
                    const occurrencesForThis = habitOccurrences.filter((o) => o.userActionId === ua.id);

                    return (
                      <div key={ua.id} className="card h-full flex flex-col justify-between" style={{ border: 'none', boxShadow: '0 4px 20px rgba(34,29,35,0.10), 0 1px 5px rgba(34,29,35,0.06)' }}>
                        <div>
                          <div className="challenge-card__meta mb-4">
                            <span className={`tag ${isCemented ? "tag--green" : "tag--purple"}`}>
                              {isCemented ? "Cemented ✓" : "Habit Loop"}
                            </span>
                            {action?.theme && (
                              <span className="tag tag--orange">{action.theme}</span>
                            )}
                          </div>
                          <p className="challenge-card__title mb-5">{action?.title}</p>

                          {/* Rep progress bar */}
                          <div className="flex gap-1.5 h-2 mb-2">
                            {[...Array(totalReps)].map((_, i) => (
                              <div
                                key={i}
                                className="flex-1 rounded-full"
                                style={{
                                  background: i < completed
                                    ? "var(--emerald)"
                                    : "var(--color-bg-muted)",
                                }}
                              />
                            ))}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-semibold" style={{ color: "var(--bright-amber)" }}>
                              Rep Loop
                            </span>
                            <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>
                              {completed} / {totalReps}
                            </span>
                          </div>
                        </div>

                        {!isCemented && occurrencesForThis.length > 0 && (
                          <p className="text-xs mt-4" style={{ color: "var(--color-text-muted)" }}>
                            Next: {occurrencesForThis.map((o) => o.scheduledDate).join(", ")}
                          </p>
                        )}
                        {isCemented && (
                          <p className="text-xs mt-4 font-semibold" style={{ color: "var(--emerald)" }}>
                            Habit acquired — 5/5 complete
                          </p>
                        )}
                      </div>
                    );
                  })}
                </Carousel>
              </section>
            )}
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
