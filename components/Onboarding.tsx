"use client";

import React, { useState } from "react";
import { X, Zap, CalendarDays, Mail, NotebookPen, Check } from "lucide-react";
import { saveGeneratedActions, skipSelfOnboarding } from "@/app/actions/ai-actions";
import { computeTotalActionsNeeded, DAILY_DELIVERY_DAYS, type DeliveryTrack } from "@/lib/personal-action-generation";

const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const DURATIONS = [2, 4, 8, 12, 16, 20, 24] as const;

const Onboarding: React.FC<{ onComplete: () => void | Promise<void>; initialTrainingText?: string; inline?: boolean }> = ({ onComplete, initialTrainingText = "", inline = false }) => {
  const [durationWeeks, setDurationWeeks] = useState(8);
  const [track, setTrack] = useState<DeliveryTrack>("weekly");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([2]);
  const [weeklyActionCount, setWeeklyActionCount] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trainingText = initialTrainingText.trim();
  const actionCount = track === "daily" ? 1 : weeklyActionCount;

  const selectTrack = (next: DeliveryTrack) => {
    setTrack(next);
    setErrorMsg(null);
    if (next === "weekly") setDaysOfWeek((previous) => [previous[0] ?? 2]);
    else setDaysOfWeek([...DAILY_DELIVERY_DAYS]);
  };

  const handleSkip = async () => {
    setSaving(true);
    await skipSelfOnboarding();
    setSaving(false);
    await onComplete();
  };

  const handleFinish = async () => {
    if (!trainingText) {
      setErrorMsg("Add your session notes first. Your notes are the input for this plan.");
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    const { error } = await saveGeneratedActions({
      trainingText,
      focusThemes: [],
      track,
      dailyActionCount: actionCount,
      daysOfWeek,
      durationWeeks,
      emailRemindersEnabled: true,
    });
    setSaving(false);
    if (error) {
      setErrorMsg(error);
      return;
    }
    await onComplete();
  };

  const totalActions = computeTotalActionsNeeded(durationWeeks, actionCount, track, daysOfWeek);
  const cadenceSummary = track === "weekly"
    ? `${actionCount} action${actionCount === 1 ? "" : "s"} each week for ${durationWeeks} weeks`
    : `1 action each weekday for ${durationWeeks} weeks`;
  const planWarning = totalActions > 100
    ? "This is a long daily plan. Consider a shorter duration if that feels more realistic."
    : totalActions > 50
      ? "This is a busy plan. Make sure this duration feels realistic for your schedule."
      : null;

  return (
    <div className={inline ? "plan-setup-inline" : "plan-setup-overlay"}>
      <div className="plan-setup-modal" role="dialog" aria-modal="true" aria-labelledby="plan-setup-title">
        <div className="plan-setup-head">
          <div><span className="participant-eyebrow">Plan setup</span><h2 id="plan-setup-title">Choose your action pace</h2><p>Your saved notes will shape the actions. You only need to choose the schedule.</p></div>
          {!inline && <button type="button" onClick={handleSkip} disabled={saving} aria-label="Close plan setup"><X size={19} /></button>}
        </div>

        <div className={`plan-notes-source ${trainingText ? "ready" : "missing"}`}>
          <span>{trainingText ? <Check size={20} /> : <NotebookPen size={20} />}</span>
          <div><strong>{trainingText ? "Your notes are ready" : "Add notes before generating"}</strong><p>{trainingText ? "AI will use the private notes above—there are no extra planning questions." : "Close this setup, write your notes, then return here to choose a pace."}</p></div>
        </div>

        <div className="plan-setup-field">
          <label>Frequency</label>
          <div className="plan-track-segmented">
            <button type="button" className={track === "weekly" ? "active" : ""} onClick={() => selectTrack("weekly")}><CalendarDays size={18} /><span><strong>Weekly</strong><small>On one selected day</small></span></button>
            <button type="button" className={track === "daily" ? "active" : ""} onClick={() => selectTrack("daily")}><Zap size={18} /><span><strong>Daily</strong><small>Monday to Friday</small></span></button>
          </div>
        </div>

        <div className={`plan-setup-grid ${track === "weekly" ? "weekly" : "daily"}`}>
          <label className="plan-setup-field"><span>Duration</span><select value={durationWeeks} onChange={(event) => setDurationWeeks(Number(event.target.value))}>{DURATIONS.map((weeks) => <option key={weeks} value={weeks}>{weeks} weeks</option>)}</select></label>

          {track === "weekly" ? <label className="plan-setup-field"><span>Actions per week</span><select value={weeklyActionCount} onChange={(event) => setWeeklyActionCount(Number(event.target.value) as 1 | 2 | 3 | 4 | 5)}>{([1, 2, 3, 4, 5] as const).map((count) => <option key={count} value={count}>{count} action{count === 1 ? "" : "s"}</option>)}</select></label> : <div className="plan-setup-field"><span>Actions per weekday</span><div className="plan-fixed-action-count"><strong>1 action</strong><small>Fixed for a realistic daily pace</small></div></div>}

          {track === "weekly" && <label className="plan-setup-field"><span>Reminder day</span><select value={daysOfWeek[0]} onChange={(event) => setDaysOfWeek([Number(event.target.value)])}>{WEEKDAYS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>}

          <div className="plan-setup-field"><span>Reminder time</span><div className="plan-fixed-action-count"><strong>11:30 AM IST</strong><small>Fixed processing time</small></div></div>
        </div>

        <div className="plan-email-note"><Mail size={18} /><div><strong>Email reminders included</strong><p>We&apos;ll email you on {track === "weekly" ? "your selected day" : "weekdays"} when the next action is ready.</p></div></div>

        <div className="plan-setup-summary"><div><strong>{cadenceSummary}</strong><small>AI will generate the complete plan from your notes.</small></div><b>{totalActions} actions</b></div>

        {planWarning && <p className="plan-setup-warning">{planWarning}</p>}
        {errorMsg && <p className="plan-setup-error">{errorMsg}</p>}

        <button type="button" className="journey-primary-button plan-generate-button" onClick={handleFinish} disabled={saving || !trainingText}>{saving ? "Generating…" : "Generate my actions"}</button>
      </div>
    </div>
  );
};

export default Onboarding;
