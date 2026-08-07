"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Cloud } from "lucide-react";
import { useEngine } from "@/lib/store";
import { getMySessionNotes, saveMySessionNotes } from "@/app/actions/session-notes";
import { usePageLoading } from "@/components/PageLoadingProvider";
import {
  buildUserNotesPayload,
  EMPTY_MY_PLAN_ANSWERS,
  hasMyPlanAnswers,
  normaliseMyPlanAnswers,
  parseStoredMyPlanAnswers,
  type MyPlanAnswers,
} from "@/lib/my-plan-notes";

export default function NotesClient({
  embedded = false,
  onBodyChange,
  onSavePlan,
  onReviewChange,
}: {
  embedded?: boolean;
  onBodyChange?: (body: string) => void;
  onSavePlan?: (body: string) => void | Promise<void>;
  onReviewChange?: (reviewing: boolean) => void;
}) {
  const { cohort } = useEngine();
  const [answers, setAnswers] = useState<MyPlanAnswers>({ ...EMPTY_MY_PLAN_ANSWERS });
  const [status, setStatus] = useState<"loading" | "saved" | "saving" | "error">("loading");
  const [error, setError] = useState("");
  const [initializing, setInitializing] = useState(true);
  const [savingPlan, setSavingPlan] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  const loaded = useRef(false);
  const skipNextSave = useRef(false);

  const userNotes = useMemo(() => buildUserNotesPayload(answers), [answers]);
  const words = useMemo(() => {
    const combined = Object.values(answers).join(" ").trim();
    return combined ? combined.split(/\s+/).length : 0;
  }, [answers]);

  usePageLoading(embedded ? false : initializing);

  useEffect(() => {
    let cancelled = false;
    loaded.current = false;
    setInitializing(true);
    setStatus("loading");
    getMySessionNotes(cohort?.id).then((result) => {
      if (cancelled) return;
      skipNextSave.current = true;
      setAnswers(result.answers
        ? normaliseMyPlanAnswers(result.answers)
        : parseStoredMyPlanAnswers(result.body));
      const hasSavedAnswers = result.answers
        ? hasMyPlanAnswers(normaliseMyPlanAnswers(result.answers))
        : Boolean(result.body.trim());
      setReviewing(hasSavedAnswers);
      onReviewChange?.(hasSavedAnswers);
      setUpdatedAt(result.updatedAt);
      setError(result.error ?? "");
      setStatus(result.error ? "error" : "saved");
      loaded.current = true;
      setInitializing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [cohort?.id, onReviewChange]);

  useEffect(() => {
    if (!loaded.current) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    setStatus("saving");
    const timer = window.setTimeout(async () => {
      const result = await saveMySessionNotes(answers, cohort?.id);
      setError(result.error ?? "");
      setStatus(result.error ? "error" : "saved");
    }, 700);
    return () => window.clearTimeout(timer);
  }, [answers, cohort?.id]);

  useEffect(() => {
    if (loaded.current) onBodyChange?.(userNotes);
  }, [userNotes, onBodyChange]);

  const updateAnswer = (field: keyof MyPlanAnswers, value: string) => {
    setAnswers((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const handleSavePlan = async () => {
    if (!hasMyPlanAnswers(answers)) {
      setError("Add at least one answer before saving your plan.");
      setStatus("error");
      return;
    }
    setSavingPlan(true);
    setStatus("saving");
    setError("");
    const result = await saveMySessionNotes(answers, cohort?.id);
    if (result.error) {
      setError(result.error);
      setStatus("error");
      setSavingPlan(false);
      return;
    }
    setUpdatedAt(result.updatedAt);
    setStatus("saved");
    onBodyChange?.(userNotes);
    setReviewing(true);
    onReviewChange?.(true);
    setSavingPlan(false);
  };

  const editPlan = () => {
    setReviewing(false);
    onReviewChange?.(false);
  };

  const generateActions = async () => {
    await onSavePlan?.(userNotes);
  };

  const savedDate = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(updatedAt ? new Date(updatedAt) : new Date());
  const roleLine = [answers.designation.trim(), answers.team.trim()].filter(Boolean).join("  •  ");
  const workAndSkill = [answers.dailyWork.trim(), answers.skillGoal.trim()].filter(Boolean).join(" ");

  if (initializing) return embedded
    ? <section className="unified-plan-section"><div className="journey-card unified-plan-loading" /></section>
    : null;

  if (reviewing) {
    return (
      <section className={`journey-page notes-page${embedded ? " unified-plan-section" : ""}`} id={embedded ? "notes" : undefined}>
        {!embedded && <div className="participant-page-heading"><span className="participant-eyebrow">My Plan</span><h1>Your Plan</h1><p>A clean, shareable version of what you wrote.</p></div>}
        <article className="my-plan-review-card">
          <header>
            <span>My Plan</span>
            <h2>{answers.name.trim() || "Your Plan"}</h2>
            {roleLine && <p>{roleLine}</p>}
            <time dateTime={updatedAt}>{savedDate}</time>
          </header>
          <div className="my-plan-review-body">
            {workAndSkill && <p>{workAndSkill}</p>}
            {answers.practiceOpportunities.trim() && <p>{answers.practiceOpportunities.trim()}</p>}
          </div>
          <footer>
            <button type="button" className="my-plan-edit-button" onClick={editPlan}><ArrowLeft size={15} /> Edit my plan</button>
            <button type="button" className="journey-primary-button" onClick={() => void generateActions()}>Generate My Actions <ArrowRight size={16} /></button>
          </footer>
        </article>
      </section>
    );
  }

  return (
    <section className={`journey-page notes-page${embedded ? " unified-plan-section" : ""}`} id={embedded ? "notes" : undefined}>
      {!embedded && <div className="participant-page-heading"><span className="participant-eyebrow">Private workspace</span><h1>My Plan</h1><p>Answer in your own words. This becomes your personal plan.</p></div>}
      <div className="notes-layout">
        <section className="journey-card notes-editor-card my-plan-answer-card">
          <div className="my-plan-question my-plan-details">
            <div className="my-plan-question-heading">
              <h2>Your details</h2>
              <p>This helps us personalize your plan to your role and team.</p>
            </div>
            <div className="my-plan-details-grid">
              <label><span>Name</span><input value={answers.name} onChange={(event) => updateAnswer("name", event.target.value)} placeholder="Your name" maxLength={200} disabled={savingPlan} /></label>
              <label><span>Designation</span><input value={answers.designation} onChange={(event) => updateAnswer("designation", event.target.value)} placeholder="e.g. Team Lead" maxLength={200} disabled={savingPlan} /></label>
              <label><span>Team</span><input value={answers.team} onChange={(event) => updateAnswer("team", event.target.value)} placeholder="e.g. Customer Success" maxLength={200} disabled={savingPlan} /></label>
            </div>
          </div>

          <label className="my-plan-question">
            <span className="my-plan-question-heading">
              <strong>1. What kind of work do you do every day?</strong>
              <em>Your role, your team, who you work with most.</em>
            </span>
            <textarea value={answers.dailyWork} onChange={(event) => updateAnswer("dailyWork", event.target.value)} placeholder="Write your answer here..." rows={3} maxLength={12000} disabled={savingPlan} />
          </label>

          <label className="my-plan-question">
            <span className="my-plan-question-heading">
              <strong>2. What skill do you want to build, and why does it matter to you?</strong>
              <em>Be specific, not &quot;communication&quot; but &quot;speaking up without hesitating.&quot; List more than one if you like.</em>
            </span>
            <textarea value={answers.skillGoal} onChange={(event) => updateAnswer("skillGoal", event.target.value)} placeholder="Write your answer here..." rows={3} maxLength={12000} disabled={savingPlan} />
          </label>

          <label className="my-plan-question">
            <span className="my-plan-question-heading">
              <strong>3. Where will you get chances to practice these, regularly, at work?</strong>
              <em>Things that happen often, like meetings or 1:1s.</em>
            </span>
            <textarea value={answers.practiceOpportunities} onChange={(event) => updateAnswer("practiceOpportunities", event.target.value)} placeholder="Write your answer here..." rows={3} maxLength={12000} disabled={savingPlan} />
          </label>

          {error && <p className="notes-error">{error}</p>}
          <div className="notes-editor-actions my-plan-form-actions">
            <span className={`notes-save-state ${status}`}>
              {status === "saved" ? <Check size={14} /> : <Cloud size={14} />}
              {status === "loading"
                ? "Loading…"
                : status === "saving"
                  ? "Saving…"
                  : status === "error"
                    ? "Not saved"
                    : `Saved · ${words} ${words === 1 ? "word" : "words"}`}
            </span>
            <button type="button" className="journey-primary-button" disabled={savingPlan || !hasMyPlanAnswers(answers)} onClick={handleSavePlan}>
              {savingPlan ? "Saving…" : "Save my plan"}
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
