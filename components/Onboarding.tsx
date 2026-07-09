"use client";

import React, { useState } from "react";
import { X, ArrowRight, Sparkles, Loader2, Trash2 } from "lucide-react";
import type { ActionTheme } from "@/lib/types";
import {
  generatePersonalActions,
  saveGeneratedActions,
  skipSelfOnboarding,
  type DraftAction,
} from "@/app/actions/ai-actions";
import { ACTION_DECK } from "@/lib/constants";
import { getCurrentISTDate } from "@/lib/timezone-utils";

type Step = "qna" | "examples" | "generating" | "review" | "commit" | "error";

type EditableDraft = DraftAction & {
  day: string;
  time: string;
  timesPerWeek: number;
};

const THEMES: ActionTheme[] = ["Collaboration", "Feedback", "Accountability", "Connection", "Coaching"];

const Onboarding: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [step, setStep] = useState<Step>("qna");
  const [trainingText, setTrainingText] = useState("");
  const [focusThemes, setFocusThemes] = useState<ActionTheme[]>([]);
  const [drafts, setDrafts] = useState<EditableDraft[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleTheme = (theme: ActionTheme) => {
    setFocusThemes((prev) =>
      prev.includes(theme) ? prev.filter((t) => t !== theme) : [...prev, theme]
    );
  };

  const runGeneration = async () => {
    setStep("generating");
    setErrorMsg(null);
    const { drafts: result, error } = await generatePersonalActions({ trainingText, focusThemes });
    if (error || !result) {
      setErrorMsg(error ?? "Something went wrong generating your actions.");
      setStep("error");
      return;
    }
    const today = getCurrentISTDate();
    setDrafts(
      result.map((d) => ({
        ...d,
        day: today,
        time: "09:00",
        timesPerWeek: 3,
      }))
    );
    setStep("review");
  };

  const updateDraft = (index: number, patch: Partial<EditableDraft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const removeDraft = (index: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSkip = async () => {
    setSaving(true);
    await skipSelfOnboarding();
    setSaving(false);
    onComplete();
  };

  const handleFinish = async () => {
    setSaving(true);
    const { error } = await saveGeneratedActions(drafts);
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
      style={{ background: "rgba(34,29,35,0.65)", backdropFilter: "blur(12px)" }}>
      <div className="card card--wide animate-pop w-full overflow-y-auto no-scrollbar" style={{ maxHeight: "90vh" }}>

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
              <div className="flex flex-wrap gap-2">
                {THEMES.map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    onClick={() => toggleTheme(theme)}
                    className={`btn btn--sm ${focusThemes.includes(theme) ? "btn--primary" : "btn--decline"}`}
                  >
                    {theme}
                  </button>
                ))}
              </div>
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
                <p className="card__subtitle mb-0">Tweak anything before adding it to your queue.</p>
              </div>
              <button onClick={handleSkip} disabled={saving} className="btn btn--icon ml-4">
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {drafts.map((draft, i) => (
                <div key={i} className="card__inset">
                  <div className="flex justify-between items-start mb-3">
                    <select
                      className="form-input"
                      style={{ width: "auto" }}
                      value={draft.theme}
                      onChange={(e) => updateDraft(i, { theme: e.target.value as ActionTheme })}
                    >
                      {THEMES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <button onClick={() => removeDraft(i)} className="btn btn--icon" aria-label="Remove">
                      <Trash2 size={16} strokeWidth={2.5} />
                    </button>
                  </div>
                  <input
                    className="form-input mb-2"
                    value={draft.title}
                    onChange={(e) => updateDraft(i, { title: e.target.value })}
                    placeholder="Title"
                  />
                  <textarea
                    className="form-input mb-2"
                    style={{ minHeight: "60px" }}
                    value={draft.how}
                    onChange={(e) => updateDraft(i, { how: e.target.value })}
                    placeholder="How"
                  />
                  <textarea
                    className="form-input"
                    style={{ minHeight: "50px" }}
                    value={draft.why}
                    onChange={(e) => updateDraft(i, { why: e.target.value })}
                    placeholder="Why"
                  />
                </div>
              ))}
              {drafts.length === 0 && (
                <p className="text-sm text-center" style={{ color: "var(--color-text-muted)" }}>
                  No actions left. Go back and regenerate, or skip for now.
                </p>
              )}
            </div>

            <button
              onClick={() => setStep("commit")}
              disabled={drafts.length === 0}
              className="btn btn--primary btn--full"
            >
              Continue <ArrowRight size={18} strokeWidth={2.5} />
            </button>
          </>
        )}

        {step === "commit" && (
          <>
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="tag tag--yellow mb-3 inline-block">Set Reminders</span>
                <h3 className="card__title">When do you want to do these?</h3>
                <p className="card__subtitle mb-0">
                  We&apos;ll send one reminder email every Monday for each action.
                </p>
              </div>
              <button onClick={handleSkip} disabled={saving} className="btn btn--icon ml-4">
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {drafts.map((draft, i) => (
                <div key={i} className="card__inset">
                  <p className="text-sm font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
                    {draft.title}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="form-group mb-0">
                      <label className="form-label">Start date</label>
                      <input
                        type="date"
                        className="form-input"
                        value={draft.day}
                        onChange={(e) => updateDraft(i, { day: e.target.value })}
                      />
                    </div>
                    <div className="form-group mb-0">
                      <label className="form-label">Time (IST)</label>
                      <input
                        type="time"
                        className="form-input"
                        value={draft.time}
                        onChange={(e) => updateDraft(i, { time: e.target.value })}
                      />
                    </div>
                    <div className="form-group mb-0">
                      <label className="form-label">Times / week</label>
                      <select
                        className="form-input"
                        value={draft.timesPerWeek}
                        onChange={(e) => updateDraft(i, { timesPerWeek: parseInt(e.target.value, 10) })}
                      >
                        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                          <option key={n} value={n}>{n}x / week</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
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
