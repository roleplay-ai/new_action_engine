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
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const REMINDER_TIMES = Array.from({ length: 10 }, (_, index) => {
  const hour = index + 9;
  return { value: `${String(hour).padStart(2, "0")}:00`, label: `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? "PM" : "AM"}` };
});

const Onboarding: React.FC<{ onComplete: () => void; initialTrainingText?: string }> = ({ onComplete, initialTrainingText = "" }) => {
  const [step, setStep] = useState<Step>("qna");
  const [trainingText, setTrainingText] = useState(initialTrainingText);
  const [focusCustomText, setFocusCustomText] = useState("");
  const [durationWeeks, setDurationWeeks] = useState(8);
  const [track, setTrack] = useState<DeliveryTrack>("weekly");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([2]);
  const [dailyActionCount, setDailyActionCount] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [deliveryTime, setDeliveryTime] = useState("11:00");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectTrack = (next: DeliveryTrack) => {
    setTrack(next);
    if (next === "weekly") {
      setDaysOfWeek((prev) => [prev[0] ?? 2]);
    } else {
      setDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
    }
  };

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
  const cadenceSummary = track === "weekly"
    ? `${dailyActionCount} action${dailyActionCount === 1 ? "" : "s"} each week for ${durationWeeks} weeks`
    : `${dailyActionCount} action${dailyActionCount === 1 ? "" : "s"} each day for ${durationWeeks} weeks`;
  const planWarning = totalActions > 100
    ? "This is a very intensive plan. Consider fewer daily actions or a shorter duration."
    : totalActions > 50
      ? "This is a busy plan. Make sure this pace is realistic for your schedule."
      : null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 sm:p-8"
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
                placeholder="Your saved session notes will appear here, or describe the workshop in your own words…"
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
                <h3 className="card__title">Choose your action pace</h3>
                <p className="card__subtitle mb-0">
                  Choose how long you want to practise, how many actions you want, and when to be reminded.
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              <button
                type="button"
                onClick={() => selectTrack("weekly")}
                className={`card__inset text-left transition-all ${track === "weekly" ? "ring-2 ring-offset-2" : "opacity-70 hover:opacity-100"}`}
                style={track === "weekly" ? { borderColor: "var(--color-border-yellow)" } : {}}
              >
                <div className="flex items-center justify-between mb-2">
                  <CalendarDays size={20} style={{ color: track === "weekly" ? "var(--bright-amber)" : "var(--color-text-muted)" }} />
                  {track === "weekly" && <span className="tag tag--featured">Selected</span>}
                </div>
                <h5 className="font-bold mb-1" style={{ color: "var(--color-text-primary)" }}>Weekly actions</h5>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Practise on one selected day each week.</p>
              </button>

              <button
                type="button"
                onClick={() => selectTrack("daily")}
                className={`card__inset text-left transition-all ${track === "daily" ? "ring-2 ring-offset-2" : "opacity-70 hover:opacity-100"}`}
                style={track === "daily" ? { borderColor: "var(--color-border-yellow)" } as React.CSSProperties : {}}
              >
                <div className="flex items-center justify-between mb-2">
                  <Zap size={20} style={{ color: track === "daily" ? "var(--bright-amber)" : "var(--color-text-muted)" }} />
                  {track === "daily" && <span className="tag tag--featured">Selected</span>}
                </div>
                <h5 className="font-bold mb-1" style={{ color: "var(--color-text-primary)" }}>Daily actions</h5>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Use short workplace actions every day.</p>
              </button>
            </div>

            <div className={`grid gap-4 mb-5 ${track === "weekly" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              <div className="form-group mb-0">
                <label className="form-label">Actions per {track === "weekly" ? "week" : "day"}</label>
                <select className="form-input" value={dailyActionCount} onChange={(event) => setDailyActionCount(Number(event.target.value) as 1 | 2 | 3 | 4 | 5)}>
                  {([1, 2, 3, 4, 5] as const).map((count) => <option key={count} value={count}>{count} action{count === 1 ? "" : "s"}</option>)}
                </select>
              </div>
              {track === "weekly" && <div className="form-group mb-0">
                <label className="form-label">Reminder day</label>
                <select className="form-input" value={daysOfWeek[0]} onChange={(event) => setDaysOfWeek([Number(event.target.value)])}>
                  {WEEKDAYS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>}
              <div className="form-group mb-0">
                <label className="form-label">Reminder time</label>
                <select className="form-input" value={deliveryTime} onChange={(event) => setDeliveryTime(event.target.value)}>
                  {REMINDER_TIMES.map((time) => <option key={time.value} value={time.value}>{time.label}</option>)}
                </select>
              </div>
            </div>

            <div className="card__inset mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div><p className="font-bold" style={{ color: "var(--color-text-primary)" }}>{cadenceSummary}</p><p className="text-xs" style={{ color: "var(--color-text-muted)" }}>AI will generate your complete practice plan.</p></div>
              <p className="text-xl font-bold whitespace-nowrap" style={{ color: "var(--color-text-primary)" }}>{totalActions} actions</p>
            </div>

            {planWarning && <div className="mb-5 rounded-xl px-4 py-3 text-xs font-semibold" style={{ color: totalActions > 100 ? "#9b2c35" : "#7a5f00", background: totalActions > 100 ? "#feecee" : "rgba(255,206,0,.14)", border: `1px solid ${totalActions > 100 ? "#facbd0" : "var(--color-border-yellow)"}` }}>{planWarning}</div>}

            {errorMsg && (
              <p className="text-sm font-semibold mb-4" style={{ color: "var(--color-danger)" }}>{errorMsg}</p>
            )}

            <button onClick={handleFinish} disabled={saving} className="btn btn--primary btn--full">
              {saving ? "Generating…" : "Generate my actions"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
