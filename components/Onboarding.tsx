"use client";

import React, { useState } from "react";
import { X, ArrowRight, Sparkles, Loader2, Trash2, Zap, CalendarDays, PlusCircle } from "lucide-react";
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
  const [drafts, setDrafts] = useState<DraftAction[]>([]);
  const [generatingMore, setGeneratingMore] = useState(false);
  const [track, setTrack] = useState<DeliveryTrack>("daily");
  const [timeIST, setTimeIST] = useState("09:00");
  const [dayOfWeek, setDayOfWeek] = useState(1);
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
    setDrafts(result);
    setStep("review");
  };

  const generateMore = async () => {
    setGeneratingMore(true);
    const { drafts: result, error } = await generatePersonalActions({ trainingText, focusThemes });
    setGeneratingMore(false);
    if (error || !result) {
      setErrorMsg(error ?? "Couldn't generate more actions right now.");
      return;
    }
    setErrorMsg(null);
    // Append — the user can browse as many as they want; only the first
    // BATCH_SIZE kept drafts land in "My Actions" today, the rest go to backlog.
    setDrafts((prev) => [...prev, ...result]);
  };

  const updateDraft = (index: number, patch: Partial<DraftAction>) => {
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
    const { error } = await saveGeneratedActions({
      drafts,
      trainingText,
      focusThemes,
      track,
      timeIST,
      dayOfWeek: track === "weekly" ? dayOfWeek : undefined,
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {drafts.map((draft, i) => (
                <div key={i} className="card" style={{ maxWidth: "none" }}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="grid grid-cols-2 gap-2 flex-1 mr-3">
                      <div className="form-group mb-0">
                        <label className="form-label">Theme</label>
                        <select
                          className="form-input"
                          style={{ fontSize: "var(--text-sm)" }}
                          value={draft.theme}
                          onChange={(e) => updateDraft(i, { theme: e.target.value as ActionTheme })}
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
                          value={draft.timeEstimate}
                          onChange={(e) => updateDraft(i, { timeEstimate: e.target.value })}
                        >
                          {["2 mins", "5 mins", "15 mins", "30 mins"].map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button onClick={() => removeDraft(i)} className="btn btn--icon shrink-0" aria-label="Remove action">
                      <Trash2 size={16} strokeWidth={2.5} />
                    </button>
                  </div>

                  <div className="form-group mb-3">
                    <label className="form-label">What (Objective Headline)</label>
                    <input
                      className="form-input"
                      value={draft.title}
                      onChange={(e) => updateDraft(i, { title: e.target.value })}
                      placeholder="e.g. End meetings with a summary…"
                    />
                  </div>
                  <div className="form-group mb-3">
                    <label className="form-label">How (Tactical Step)</label>
                    <textarea
                      className="form-input"
                      style={{ minHeight: "70px" }}
                      value={draft.how}
                      onChange={(e) => updateDraft(i, { how: e.target.value })}
                      placeholder="Specify the exact verbal or digital cue…"
                    />
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label">Why (Behavioral Logic)</label>
                    <textarea
                      className="form-input"
                      style={{ minHeight: "60px" }}
                      value={draft.why}
                      onChange={(e) => updateDraft(i, { why: e.target.value })}
                      placeholder="Explain the cognitive impact…"
                    />
                  </div>
                </div>
              ))}
              {drafts.length === 0 && (
                <p className="text-sm text-center" style={{ color: "var(--color-text-muted)" }}>
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
                <span className="tag tag--yellow mb-3 inline-block">When do you want this?</span>
                <h3 className="card__title">Pick a sprint and a time</h3>
                <p className="card__subtitle mb-0">
                  These {drafts.length} action{drafts.length === 1 ? "" : "s"} are yours to act on right away.
                  On this cadence, we&apos;ll drop a fresh batch into your queue.
                </p>
              </div>
              <button onClick={handleSkip} disabled={saving} className="btn btn--icon ml-4">
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            <div className="space-y-3 mb-6">
              {drafts.map((draft, i) => (
                <div key={i} className="card__inset">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="tag tag--orange">{draft.theme}</span>
                  </div>
                  <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    {draft.title}
                  </p>
                </div>
              ))}
            </div>

            {/* Track cards */}
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
                  A fresh batch of actions every day.
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
                  A fresh batch once a week, on a day you pick.
                </p>
              </button>
            </div>

            <div className="form-group mb-5">
              <label className="form-label">What time? (IST)</label>
              <input
                type="time"
                className="form-input"
                value={timeIST}
                onChange={(e) => setTimeIST(e.target.value || "09:00")}
              />
            </div>

            {track === "weekly" && (
              <div className="form-group mb-6">
                <label className="form-label">Which day of the week?</label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDayOfWeek(value)}
                      className={`btn btn--sm ${dayOfWeek === value ? "btn--primary" : "btn--decline"}`}
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
    </div>
  );
};

export default Onboarding;
