"use client";

import React, { useState } from "react";
import { X, ArrowRight, Zap, CalendarDays } from "lucide-react";
import {
  saveGeneratedActions,
  skipSelfOnboarding,
} from "@/app/actions/ai-actions";
import { computeTotalActionsNeeded, type DeliveryTrack } from "@/lib/personal-action-generation";

type Step = "qna" | "cadence";

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const Onboarding: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [step, setStep] = useState<Step>("qna");
  const [trainingText, setTrainingText] = useState("");
  const [focusCustomText, setFocusCustomText] = useState("");
  const [durationWeeks, setDurationWeeks] = useState(8);
  const [track, setTrack] = useState<DeliveryTrack>("daily");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [dailyActionCount, setDailyActionCount] = useState<2 | 3 | 4>(3);
  const [deliveryTime, setDeliveryTime] = useState("09:00");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectTrack = (next: DeliveryTrack) => {
    setTrack(next);
    if (next === "weekly") {
      setDaysOfWeek((prev) => [prev[0] ?? 1]);
    } else if (daysOfWeek.length <= 1) {
      setDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
    }
  };

  // Daily Sprint: toggle any number of days on/off (at least one stays selected).
  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) => {
      if (prev.includes(day)) {
        const next = prev.filter((d) => d !== day);
        return next.length ? next : prev;
      }
      return [...prev, day].sort((a, b) => a - b);
    });
  };

  // Weekly Sprint: exactly one day at a time.
  const selectSingleDay = (day: number) => setDaysOfWeek([day]);

  const handleSkip = async () => {
    setSaving(true);
    await skipSelfOnboarding();
    setSaving(false);
    onComplete();
  };

  const handleFinish = async () => {
    setSaving(true);
    setErrorMsg(null);
    const { error } = await saveGeneratedActions({
      trainingText,
      focusThemes: [],
      focusCustomText,
      track,
      dailyActionCount,
      deliveryTime,
      daysOfWeek,
      durationWeeks,
    });
    setSaving(false);
    if (error) {
      setErrorMsg(error);
      return;
    }
    onComplete();
  };

  const totalActions = computeTotalActionsNeeded(durationWeeks, dailyActionCount, track, daysOfWeek);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
      style={{ background: "rgba(34,29,35,0.65)", backdropFilter: "blur(12px)" }}>
      <div
        className="card card--wide animate-pop w-full overflow-y-auto no-scrollbar"
        style={{ maxHeight: "90vh", maxWidth: step === "cadence" ? "var(--max-width-wide)" : undefined }}
      >

        {step === "qna" && (
          <>
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="tag tag--yellow mb-3 inline-block">Get Started</span>
                <h3 className="card__title">Tell us about your training</h3>
                <p className="card__subtitle mb-0">
                  We&apos;ll use this to generate your personal action plan.
                </p>
              </div>
              <button onClick={handleSkip} disabled={saving} className="btn btn--icon ml-4">
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            <div className="form-group mb-5">
              <label className="form-label">What training did you do?</label>
              <textarea
                placeholder="e.g. a workshop on giving direct feedback..."
                className="form-input"
                style={{ minHeight: "100px", resize: "vertical" }}
                value={trainingText}
                onChange={(e) => setTrainingText(e.target.value)}
              />
            </div>

            <div className="form-group mb-6">
              <label className="form-label">What key areas do you want to focus on?</label>
              <p className="text-xs mb-3" style={{ color: "var(--color-text-muted)" }}>
                Tell us in your own words.
              </p>
              <textarea
                placeholder="e.g. building trust with my remote team, handling difficult conversations..."
                className="form-input"
                style={{ minHeight: "80px", resize: "vertical" }}
                value={focusCustomText}
                onChange={(e) => setFocusCustomText(e.target.value)}
              />
            </div>

            <button onClick={() => setStep("cadence")} className="btn btn--primary btn--full">
              Continue <ArrowRight size={18} strokeWidth={2.5} />
            </button>
          </>
        )}

        {step === "cadence" && (
          <>
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="tag tag--yellow mb-3 inline-block">Plan setup</span>
                <h3 className="card__title">Set your sprint cadence</h3>
                <p className="card__subtitle mb-0">
                  Choose how long your plan runs, how often you get a delivery, and how many
                  actions each time.
                </p>
              </div>
              <button onClick={handleSkip} disabled={saving} className="btn btn--icon ml-4">
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            <div className="form-group mb-5">
              <label className="form-label">How long is this plan?</label>
              <p className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>
                Pick anywhere from 2 to 24 weeks.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={2}
                  max={24}
                  step={1}
                  value={durationWeeks}
                  onChange={(e) => setDurationWeeks(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span
                  className="text-sm font-semibold whitespace-nowrap"
                  style={{ color: "var(--color-text-primary)", minWidth: "72px", textAlign: "right" }}
                >
                  {durationWeeks} {durationWeeks === 1 ? "week" : "weeks"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <button
                type="button"
                onClick={() => selectTrack("daily")}
                className={`card__inset text-left transition-all ${track === "daily" ? "ring-2 ring-offset-2" : "opacity-70 hover:opacity-100"}`}
                style={track === "daily" ? { borderColor: "var(--color-border-yellow)" } as React.CSSProperties : {}}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="icon-badge icon-badge--sm" style={{ marginBottom: 0 }}>
                    <Zap size={20} style={{ color: track === "daily" ? "var(--bright-amber)" : "var(--color-text-muted)" }} />
                  </div>
                  {track === "daily" && <span className="tag tag--featured">Selected</span>}
                </div>
                <h5 className="font-bold mb-1" style={{ color: "var(--color-text-primary)" }}>Daily Sprint</h5>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  A fresh delivery on the days you pick below — unselect any you don&apos;t want.
                </p>
              </button>

              <button
                type="button"
                onClick={() => selectTrack("weekly")}
                className={`card__inset text-left transition-all ${track === "weekly" ? "ring-2 ring-offset-2" : "opacity-70 hover:opacity-100"}`}
                style={track === "weekly" ? { borderColor: "var(--color-border-yellow)" } : {}}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="icon-badge icon-badge--sm" style={{ marginBottom: 0 }}>
                    <CalendarDays size={20} style={{ color: track === "weekly" ? "var(--majorelle-blue)" : "var(--color-text-muted)" }} />
                  </div>
                  {track === "weekly" && <span className="tag tag--featured">Selected</span>}
                </div>
                <h5 className="font-bold mb-1" style={{ color: "var(--color-text-primary)" }}>Weekly Sprint</h5>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  One delivery a week, on a single day you pick below.
                </p>
              </button>
            </div>

            <div className="form-group mb-5">
              <label className="form-label">
                {track === "daily" ? "Which days of the week?" : "Which day of the week?"}
              </label>
              <p className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>
                {track === "daily"
                  ? "Selected days get a fresh delivery — unselect any you want to skip."
                  : "Pick the one day you want your weekly delivery."}
              </p>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => (track === "daily" ? toggleDay(value) : selectSingleDay(value))}
                    className={`btn btn--sm ${daysOfWeek.includes(value) ? "btn--primary" : "btn--decline"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group mb-5">
              <label className="form-label">How many actions per delivery?</label>
              <div className="flex gap-2">
                {([2, 3, 4] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setDailyActionCount(n)}
                    className={`btn btn--sm flex-1 ${dailyActionCount === n ? "btn--primary" : "btn--decline"}`}
                  >
                    {n} actions
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group mb-5">
              <label className="form-label">What time should new actions arrive?</label>
              <p className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>
                We&apos;ll drop your next delivery in My Actions around this time (IST).
              </p>
              <input
                type="time"
                className="form-input"
                style={{ maxWidth: "180px" }}
                value={deliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value)}
              />
            </div>

            <div className="card__inset mb-6" style={{ textAlign: "center" }}>
              <p className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
                {totalActions} actions
              </p>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                will be generated for your {durationWeeks}-week plan — we&apos;ll build them in the
                background and drop them into your action library as they&apos;re ready.
              </p>
            </div>

            {errorMsg && (
              <p className="text-sm font-semibold mb-4" style={{ color: "var(--color-danger)" }}>{errorMsg}</p>
            )}

            <button onClick={handleFinish} disabled={saving} className="btn btn--primary btn--full">
              {saving ? "Saving…" : "Finish Setup"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
