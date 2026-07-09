"use client";

import React, { useState } from "react";
import { X, ArrowRight, Sparkles, Loader2, Trash2, Zap, CalendarDays, PlusCircle, Pencil } from "lucide-react";
import type { ActionTheme } from "@/lib/types";
import {
  generatePersonalActions,
  saveGeneratedActions,
  skipSelfOnboarding,
} from "@/app/actions/ai-actions";
import type { DraftAction, DeliveryTrack } from "@/lib/personal-action-generation";
import { ACTION_DECK } from "@/lib/constants";

type Step = "qna" | "examples" | "generating" | "review" | "commit" | "error";

const THEMES: ActionTheme[] = ["Collaboration", "Feedback", "Accountability", "Connection", "Coaching"];

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
  const [focusThemes, setFocusThemes] = useState<ActionTheme[]>([]);
  const [focusCustomText, setFocusCustomText] = useState("");
  const [drafts, setDrafts] = useState<DraftAction[]>([]);
  const [generatingMore, setGeneratingMore] = useState(false);
  const [track, setTrack] = useState<DeliveryTrack>("daily");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1]);
  const [dailyActionCount, setDailyActionCount] = useState<1 | 2 | 3>(3);
  const [deliveryTime, setDeliveryTime] = useState("09:00");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleTheme = (theme: ActionTheme) => {
    setFocusThemes((prev) =>
      prev.includes(theme) ? prev.filter((t) => t !== theme) : [...prev, theme]
    );
  };

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) => {
      if (prev.includes(day)) {
        const next = prev.filter((d) => d !== day);
        return next.length ? next : prev;
      }
      return [...prev, day].sort((a, b) => a - b);
    });
  };

  const runGeneration = async () => {
    setStep("generating");
    setErrorMsg(null);
    const { drafts: result, error } = await generatePersonalActions({ trainingText, focusThemes, focusCustomText });
    if (error || !result) {
      setErrorMsg(error ?? "Something went wrong generating your actions.");
      setStep("error");
      return;
    }
    setDrafts(result);
    setStep("review");
  };

  const generateMore = async () => {
    setGeneratingMore(true);
    const { drafts: result, error } = await generatePersonalActions({ trainingText, focusThemes, focusCustomText });
    setGeneratingMore(false);
    if (error || !result) {
      setErrorMsg(error ?? "Couldn't generate more actions right now.");
      return;
    }
    setErrorMsg(null);
    setDrafts((prev) => [...prev, ...result]);
  };

  const updateDraft = (index: number, patch: Partial<DraftAction>) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const removeDraft = (index: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
  };

  const handleSkip = async () => {
    setSaving(true);
    await skipSelfOnboarding();
    setSaving(false);
    onComplete();
  };

  const handleFinish = async () => {
    setSaving(true);
    const { error } = await saveGeneratedActions({
      drafts,
      trainingText,
      focusThemes,
      focusCustomText,
      track,
      dailyActionCount,
      deliveryTime,
      daysOfWeek: track === "weekly" ? daysOfWeek : undefined,
    });
    setSaving(false);
    if (error) {
      setErrorMsg(error);
      return;
    }
    onComplete();
  };

  const exampleActions = (
    focusThemes.length
      ? ACTION_DECK.filter((a) => focusThemes.includes(a.theme))
      : ACTION_DECK
  ).slice(0, 3);

  const isWideStep = step === "review" || step === "commit";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
      style={{ background: "rgba(34,29,35,0.65)", backdropFilter: "blur(12px)" }}>
      <div
        className="card card--wide animate-pop w-full overflow-y-auto no-scrollbar"
        style={{ maxHeight: "90vh", maxWidth: isWideStep ? "var(--max-width-wide)" : undefined }}
      >

        {step === "qna" && (
          <>
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="tag tag--yellow mb-3 inline-block">Get Started</span>
                <h3 className="card__title">Tell us about your training</h3>
                <p className="card__subtitle mb-0">
                  We&apos;ll use this to generate a few personal actions for you.
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
                Pick themes below, write your own focus, or both.
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {THEMES.map((theme) => {
                  const selected = focusThemes.includes(theme);
                  return (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => toggleTheme(theme)}
                      className={`btn btn--sm ${selected ? "btn--primary" : "btn--decline"}`}
                    >
                      {theme}
                    </button>
                  );
                })}
              </div>
              <textarea
                placeholder="e.g. building trust with my remote team, handling difficult conversations..."
                className="form-input"
                style={{ minHeight: "80px", resize: "vertical" }}
                value={focusCustomText}
                onChange={(e) => setFocusCustomText(e.target.value)}
              />
            </div>

            <button onClick={() => setStep("examples")} className="btn btn--primary btn--full">
              Continue <ArrowRight size={18} strokeWidth={2.5} />
            </button>
          </>
        )}

        {step === "examples" && (
          <>
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="tag tag--yellow mb-3 inline-block">Preview</span>
                <h3 className="card__title">Here&apos;s the kind of thing we&apos;ll suggest</h3>
                <p className="card__subtitle mb-0">A few examples of the action format.</p>
              </div>
              <button onClick={handleSkip} disabled={saving} className="btn btn--icon ml-4">
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            <div className="space-y-3 mb-6">
              {exampleActions.map((a) => (
                <div key={a.id} className="card__inset">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="tag tag--orange">{a.theme}</span>
                  </div>
                  <p className="text-sm font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>
                    {a.title}
                  </p>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{a.how}</p>
                </div>
              ))}
            </div>

            <button onClick={runGeneration} className="btn btn--primary btn--full">
              <Sparkles size={18} strokeWidth={2.5} /> Generate my actions
            </button>
          </>
        )}

        {step === "generating" && (
          <div className="text-center py-12">
            <Loader2 size={40} className="animate-spin mx-auto mb-4" style={{ color: "var(--bright-amber)" }} />
            <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Generating your personal actions…
            </p>
          </div>
        )}

        {step === "error" && (
          <div className="text-center py-8">
            <p className="text-sm font-semibold mb-4" style={{ color: "var(--color-danger)" }}>
              {errorMsg}
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={runGeneration} className="btn btn--primary">Try again</button>
              <button onClick={handleSkip} disabled={saving} className="btn btn--decline">Skip for now</button>
            </div>
          </div>
        )}

        {step === "review" && (
          <>
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="tag tag--yellow mb-3 inline-block">Review</span>
                <h3 className="card__title">Edit or accept your actions</h3>
                <p className="card__subtitle mb-0">Keep what works — edit or remove anything you don&apos;t want.</p>
              </div>
              <div className="flex items-center gap-3 ml-4 shrink-0">
                <span
                  className="text-sm font-semibold whitespace-nowrap"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {drafts.length} {drafts.length === 1 ? "action" : "actions"}
                </span>
                <button onClick={handleSkip} disabled={saving} className="btn btn--icon">
                  <X size={20} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {drafts.map((draft, i) => (
                <div
                  key={i}
                  className="card__inset flex flex-col gap-2"
                  style={{ padding: "14px 16px" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="tag tag--orange shrink-0">{draft.theme}</span>
                      <span className="text-xs font-semibold shrink-0" style={{ color: "var(--color-text-muted)" }}>
                        {draft.timeEstimate}
                      </span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => setEditingIndex(i)}
                        className="btn btn--icon"
                        aria-label="Edit action"
                        title="Edit"
                      >
                        <Pencil size={15} strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => removeDraft(i)}
                        className="btn btn--icon"
                        aria-label="Remove action"
                        title="Delete"
                      >
                        <Trash2 size={15} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                  <p
                    className="text-sm font-semibold leading-snug line-clamp-2"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {draft.title}
                  </p>
                </div>
              ))}
              {drafts.length === 0 && (
                <p className="text-sm text-center col-span-full" style={{ color: "var(--color-text-muted)" }}>
                  No actions left. Generate more, or skip for now.
                </p>
              )}
            </div>

            {errorMsg && (
              <p className="text-sm font-semibold mb-4" style={{ color: "var(--color-danger)" }}>{errorMsg}</p>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={generateMore}
                disabled={generatingMore}
                className="btn btn--decline flex-1"
              >
                {generatingMore ? (
                  <Loader2 size={16} className="animate-spin" strokeWidth={2.5} />
                ) : (
                  <PlusCircle size={16} strokeWidth={2.5} />
                )}
                Generate more
              </button>
              <button
                onClick={() => setStep("commit")}
                disabled={drafts.length === 0}
                className="btn btn--primary flex-1"
              >
                Continue <ArrowRight size={18} strokeWidth={2.5} />
              </button>
            </div>
          </>
        )}

        {step === "commit" && (
          <>
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="tag tag--yellow mb-3 inline-block">Almost done</span>
                <h3 className="card__title">Set your sprint cadence</h3>
                <p className="card__subtitle mb-0">
                  Choose how often you want a fresh batch of actions in My Actions.
                </p>
              </div>
              <button onClick={handleSkip} disabled={saving} className="btn btn--icon ml-4">
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            <div className="form-group mb-5">
              <label className="form-label">How many actions per day?</label>
              <div className="flex gap-2">
                {([1, 2, 3] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setDailyActionCount(n)}
                    className={`btn btn--sm flex-1 ${dailyActionCount === n ? "btn--primary" : "btn--decline"}`}
                  >
                    {n} {n === 1 ? "action" : "actions"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <button
                type="button"
                onClick={() => setTrack("daily")}
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
                  A fresh batch of {dailyActionCount} action{dailyActionCount === 1 ? "" : "s"} every day.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setTrack("weekly")}
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
                  A fresh batch on each day you pick below.
                </p>
              </button>
            </div>

            <div className="form-group mb-5">
              <label className="form-label">What time should new actions arrive?</label>
              <p className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>
                We&apos;ll drop your next batch in My Actions around this time (IST).
              </p>
              <input
                type="time"
                className="form-input"
                style={{ maxWidth: "180px" }}
                value={deliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value)}
              />
            </div>

            {track === "weekly" && (
              <div className="form-group mb-6">
                <label className="form-label">Which days of the week?</label>
                <p className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>
                  Select one or more — you&apos;ll get a new batch on each selected day.
                </p>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => toggleDay(value)}
                      className={`btn btn--sm ${daysOfWeek.includes(value) ? "btn--primary" : "btn--decline"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {errorMsg && (
              <p className="text-sm font-semibold mb-4" style={{ color: "var(--color-danger)" }}>{errorMsg}</p>
            )}

            <button onClick={handleFinish} disabled={saving} className="btn btn--primary btn--full">
              {saving ? "Saving…" : "Finish Setup"}
            </button>
          </>
        )}
      </div>

      {step === "review" && editingIndex !== null && drafts[editingIndex] && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6"
          style={{ background: "rgba(34,29,35,0.55)" }}
          onClick={() => setEditingIndex(null)}
        >
          <div
            className="card animate-pop w-full flex flex-col"
            style={{ maxWidth: "520px", maxHeight: "min(90vh, 680px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h4 className="font-bold" style={{ color: "var(--color-text-primary)" }}>Edit action</h4>
              <button onClick={() => setEditingIndex(null)} className="btn btn--icon">
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
                    value={drafts[editingIndex].theme}
                    onChange={(e) => updateDraft(editingIndex, { theme: e.target.value as ActionTheme })}
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
                    value={drafts[editingIndex].timeEstimate}
                    onChange={(e) => updateDraft(editingIndex, { timeEstimate: e.target.value })}
                  >
                    {["2 mins", "5 mins", "15 mins", "30 mins"].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group mb-0">
                <label className="form-label">What</label>
                <input
                  className="form-input"
                  value={drafts[editingIndex].title}
                  onChange={(e) => updateDraft(editingIndex, { title: e.target.value })}
                />
              </div>

              <div className="form-group mb-0">
                <label className="form-label">How</label>
                <textarea
                  className="form-input"
                  style={{ minHeight: "96px", resize: "vertical" }}
                  value={drafts[editingIndex].how}
                  onChange={(e) => updateDraft(editingIndex, { how: e.target.value })}
                />
              </div>

              <div className="form-group mb-0">
                <label className="form-label">Why</label>
                <textarea
                  className="form-input"
                  style={{ minHeight: "80px", resize: "vertical" }}
                  value={drafts[editingIndex].why}
                  onChange={(e) => updateDraft(editingIndex, { why: e.target.value })}
                />
              </div>
            </div>

            <button
              onClick={() => setEditingIndex(null)}
              className="btn btn--primary btn--full shrink-0 mt-4"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Onboarding;
