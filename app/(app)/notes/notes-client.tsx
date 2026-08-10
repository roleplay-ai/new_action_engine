"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Cloud, Loader2, Sparkles } from "lucide-react";
import { useEngine } from "@/lib/store";
import { getMySessionNotes, refineMySessionNotes, saveMySessionNotes } from "@/app/actions/session-notes";
import { usePageLoading } from "@/components/PageLoadingProvider";
import {
  buildUserNotesPayload,
  EMPTY_MY_PLAN_ANSWERS,
  hasMyPlanAnswers,
  normaliseMyPlanAnswers,
  parseStoredMyPlanAnswers,
  type MyPlanAnswers,
} from "@/lib/my-plan-notes";

/** Lets a parent (e.g. the unified plan page) drop the reviewer back into edit mode
 *  even after it has scrolled away to the "Generate my actions" pace-setup step. */
export type NotesClientHandle = { editPlan: () => void };

const NotesClient = forwardRef<NotesClientHandle, {
  embedded?: boolean;
  /** Once the plan step below has taken over (pace-setup / generation), the review
   *  card's own Edit/Generate buttons are redundant with that step's own back-link. */
  hideFooter?: boolean;
  onBodyChange?: (body: string) => void;
  onSavePlan?: (body: string) => void | Promise<void>;
  onReviewChange?: (reviewing: boolean) => void;
}>(function NotesClient({
  embedded = false,
  hideFooter = false,
  onBodyChange,
  onSavePlan,
  onReviewChange,
}, ref) {
  const { cohort, personalPlanState } = useEngine();
  const [answers, setAnswers] = useState<MyPlanAnswers>({ ...EMPTY_MY_PLAN_ANSWERS });
  const [status, setStatus] = useState<"loading" | "saved" | "saving" | "error">("loading");
  const [error, setError] = useState("");
  const [initializing, setInitializing] = useState(true);
  const [savingPlan, setSavingPlan] = useState(false);
  const [refining, setRefining] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  const loaded = useRef(false);
  const skipNextSave = useRef(false);
  const planLocked = personalPlanState === "active" || personalPlanState === "archived";

  const userNotes = useMemo(() => buildUserNotesPayload(answers), [answers]);
  const words = useMemo(() => {
    const combined = Object.values(answers).join(" ").trim();
    return combined ? combined.split(/\s+/).length : 0;
  }, [answers]);
  const busy = refining || savingPlan;

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
    if (!planLocked) return;
    setReviewing(true);
    onReviewChange?.(true);
  }, [planLocked, onReviewChange]);

  useEffect(() => {
    if (!loaded.current || planLocked) return;
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
  }, [answers, cohort?.id, planLocked]);

  useEffect(() => {
    if (loaded.current) onBodyChange?.(userNotes);
  }, [userNotes, onBodyChange]);

  const updateAnswer = (field: keyof MyPlanAnswers, value: string) => {
    if (planLocked) return;
    setAnswers((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const handleRefine = async () => {
    if (planLocked) return;
    if (!hasMyPlanAnswers(answers)) {
      setError("Add at least one answer before refining with AI.");
      setStatus("error");
      return;
    }
    setRefining(true);
    setError("");
    const result = await refineMySessionNotes(answers, cohort?.id);
    setRefining(false);
    if (result.error || !result.answers) {
      setError(result.error ?? "Failed to refine answers");
      setStatus("error");
      return;
    }
    skipNextSave.current = true;
    setAnswers(normaliseMyPlanAnswers(result.answers));
    onBodyChange?.(result.body ?? buildUserNotesPayload(result.answers));
    setStatus("saved");
  };

  const handleSavePlan = async () => {
    if (planLocked) return;
    if (!hasMyPlanAnswers(answers)) {
      setError("Add at least one answer before saving my plan.");
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
    if (planLocked) return;
    setReviewing(false);
    onReviewChange?.(false);
  };

  useImperativeHandle(ref, () => ({ editPlan }));

  const generateActions = async () => {
    if (planLocked) return;
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

  if (reviewing || planLocked) {
    return (
      <section className={`journey-page notes-page${embedded ? " unified-plan-section" : ""}`} id={embedded ? "notes" : undefined}>
        {!embedded && <div className="participant-page-heading"><h1>My Plan</h1><p>A clean, shareable version of what you wrote.</p></div>}
        <article className="my-plan-review-card">
          <header>
            <h2>{answers.name.trim() || "My Plan"}</h2>
            {roleLine && <p>{roleLine}</p>}
            <time dateTime={updatedAt}>{savedDate}</time>
          </header>
          <div className="my-plan-review-body">
            {workAndSkill && <p>{workAndSkill}</p>}
            {answers.practiceOpportunities.trim() && <p>{answers.practiceOpportunities.trim()}</p>}
          </div>
          {!planLocked && !hideFooter && (
            <footer>
              <button type="button" className="my-plan-edit-button" onClick={editPlan}><ArrowLeft size={15} /> Edit my plan</button>
              <button type="button" className="journey-primary-button" onClick={() => void generateActions()}>Generate My Actions <ArrowRight size={16} /></button>
            </footer>
          )}
        </article>
      </section>
    );
  }

  return (
    <section className={`journey-page notes-page${embedded ? " unified-plan-section" : ""}`} id={embedded ? "notes" : undefined}>
      {!embedded && <div className="participant-page-heading"><h1>My Plan</h1><p>Answer in your own words. This becomes my personal plan.</p></div>}
      <div className="notes-layout">
        <section className="journey-card notes-editor-card my-plan-answer-card">
          <div className="my-plan-question my-plan-details">
            <div className="my-plan-question-heading">
              <h2>Your details</h2>
              <p>This helps us personalize my plan to your role and team.</p>
            </div>
            <div className="my-plan-details-grid">
              <label><span>Name</span><input value={answers.name} onChange={(event) => updateAnswer("name", event.target.value)} placeholder="Your name" maxLength={200} disabled={busy} /></label>
              <label><span>Designation</span><input value={answers.designation} onChange={(event) => updateAnswer("designation", event.target.value)} placeholder="e.g. Team Lead" maxLength={200} disabled={busy} /></label>
              <label><span>Function</span><input value={answers.team} onChange={(event) => updateAnswer("team", event.target.value)} placeholder="e.g. Customer Success" maxLength={200} disabled={busy} /></label>
            </div>
          </div>

          <label className="my-plan-question">
            <span className="my-plan-question-heading">
              <strong>1. What kind of work do you do every day?</strong>
              <em>Your role, your team, who you work with most.</em>
            </span>
            <textarea value={answers.dailyWork} onChange={(event) => updateAnswer("dailyWork", event.target.value)} placeholder="Write your answer here..." rows={3} maxLength={12000} disabled={busy} />
          </label>

          <label className="my-plan-question">
            <span className="my-plan-question-heading">
              <strong>2. What skill do you want to build, and why does it matter to you?</strong>
              <em>Be specific, not &quot;communication&quot; but &quot;speaking up without hesitating.&quot; List more than one if you like.</em>
            </span>
            <textarea value={answers.skillGoal} onChange={(event) => updateAnswer("skillGoal", event.target.value)} placeholder="Write your answer here..." rows={3} maxLength={12000} disabled={busy} />
          </label>

          <label className="my-plan-question">
            <span className="my-plan-question-heading">
              <strong>3. Where will you get chances to practice these, regularly, at work?</strong>
              <em>Things that happen often, like meetings or 1:1s.</em>
            </span>
            <textarea value={answers.practiceOpportunities} onChange={(event) => updateAnswer("practiceOpportunities", event.target.value)} placeholder="Write your answer here..." rows={3} maxLength={12000} disabled={busy} />
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
                    : refining
                      ? "Refining…"
                      : `Saved · ${words} ${words === 1 ? "word" : "words"}`}
            </span>
            <button
              type="button"
              className="journey-secondary-button"
              disabled={busy || !hasMyPlanAnswers(answers)}
              onClick={() => void handleRefine()}
            >
              {refining ? <><Loader2 size={15} className="plan-order-spinner" /> Refining…</> : <><Sparkles size={15} /> Refine with AI</>}
            </button>
            <button type="button" className="journey-primary-button" disabled={busy || !hasMyPlanAnswers(answers)} onClick={() => void handleSavePlan()}>
              {savingPlan ? "Saving…" : "Save my plan"}
            </button>
          </div>
        </section>
      </div>
    </section>
  );
});

export default NotesClient;
