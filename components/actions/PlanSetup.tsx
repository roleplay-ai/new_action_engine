"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Mail, Pencil, CalendarDays, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useEngine } from "@/lib/store";
import { activatePersonalActionPlan, getMyPlanSettings, saveGeneratedActions } from "@/app/actions/ai-actions";
import { refineMySessionNotes, saveMySessionNotes } from "@/app/actions/session-notes";
import { getMyPlanSetupContext, type MyPlanSetupContext } from "@/app/actions/plan-setup";
import { buildUserNotesPayload, type MyPlanAnswers } from "@/lib/my-plan-notes";
import { PLAN_REMINDER_DAYS, recommendedSetup, sameSetup, setupDaysOfWeek, totalPlanActions, type PlanSetupChoice } from "@/lib/plan-setup";
import { isIndianMobile } from "@/lib/whatsapp-contacts";
import PlanFormModal, { type PlanFormValues } from "@/components/actions/PlanFormModal";
import PlanSetupModal, { type PlanSetupValues } from "@/components/actions/PlanSetupModal";

/** Set when the participant clicks Activate, so a reload mid-generation still finishes activating. */
const autoActivateKey = (cohortId: string) => `nudgeable:plan-auto-activate:${cohortId}`;
/** Setup choices and WhatsApp number made before activation (nothing stores them server-side yet). */
const setupDraftKey = (cohortId: string) => `nudgeable:plan-setup-draft:${cohortId}`;

type Activation =
  | { stage: "starting" | "generating" | "activating" }
  | { stage: "error"; message: string };

function readStorage<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the flow still works, it just won't survive a reload.
  }
}

function hasPlanAnswers(answers: MyPlanAnswers) {
  return [answers.designation, answers.skillGoal, answers.dailyWork, answers.practiceOpportunities].some((value) => value.trim());
}

/**
 * My Actions before a plan is live: the plan popup (one question), the
 * "Recommended" setup with a Change popup, and one-click Activate, which
 * generates the actions and switches the plan on as soon as they're ready.
 */
export default function PlanSetup({ onReady, onActivated, onGeneratingChange }: {
  onReady?: () => void;
  /** Loads the now-live plan; My Actions keeps the generating screen up until it resolves. */
  onActivated?: () => Promise<void>;
  /** My Actions owns the "Generating your actions" screen; this turns it on and off. */
  onGeneratingChange?: (generating: boolean) => void;
}) {
  const { profile, cohort, personalPlanState, isLoading, generationJob, generationError, refetch, refreshGenerationStatus } = useEngine();
  const cohortId = cohort?.id ?? null;
  const maxWeeks = cohort?.maxWeeks ?? null;
  const firstName = profile.name.trim().split(/\s+/)[0] || "there";

  const [context, setContext] = useState<MyPlanSetupContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [setup, setSetup] = useState<PlanSetupChoice>(() => recommendedSetup(maxWeeks));
  const [draftSetup, setDraftSetup] = useState<PlanSetupChoice | null>(null);
  const [draftActionCount, setDraftActionCount] = useState(0);
  const [whatsappOn, setWhatsappOn] = useState(true);
  const [phoneDigits, setPhoneDigits] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [activation, setActivation] = useState<Activation | null>(null);
  const [activateHint, setActivateHint] = useState<string | null>(null);
  const autoOpened = useRef(false);
  const resumeChecked = useRef(false);
  // The generation job this page started (or resumed). Activation waits for it.
  const ourJobId = useRef<string | null>(null);

  const whatsappAvailable = context?.whatsapp.available ?? false;

  useEffect(() => {
    if (!cohortId) return;
    let cancelled = false;
    setLoadError(null);
    void Promise.all([getMyPlanSetupContext(cohortId), getMyPlanSettings(cohortId)]).then(([contextResult, settingsResult]) => {
      if (cancelled) return;
      const settings = settingsResult.settings;
      // Already live (e.g. this screen mounted again right after activating):
      // go straight to My Actions instead of showing setup again.
      if (settings?.isActive && onActivated) {
        writeStorage(autoActivateKey(cohortId), null);
        onReady?.();
        void onActivated().catch(() => window.location.reload());
        return;
      }
      if (contextResult.error || !contextResult.context) {
        setLoadError(contextResult.error ?? "Your plan could not be loaded.");
        onReady?.();
        return;
      }
      const loaded = contextResult.context;
      const fromDraft: PlanSetupChoice | null = settings && !settings.isActive && !settings.isArchived
        ? {
          track: settings.track === "daily" ? "daily" : "weekly",
          actionCount: Math.min(3, Math.max(1, settings.actionCount)) as 1 | 2 | 3,
          durationWeeks: settings.durationWeeks,
          dayOfWeek: settings.daysOfWeek[0] ?? 2,
        }
        : null;
      const saved = readStorage<{ setup?: PlanSetupChoice; whatsappOn?: boolean; phoneDigits?: string }>(setupDraftKey(cohortId));
      setContext(loaded);
      onReady?.();
      setDraftSetup(fromDraft);
      setDraftActionCount(settings?.totalActionsPlanned ?? 0);
      setSetup(saved?.setup ?? fromDraft ?? recommendedSetup(maxWeeks));
      // WhatsApp is opt-in by default, unless the participant replied STOP before.
      setWhatsappOn(saved?.whatsappOn ?? !loaded.whatsapp.optedOut);
      setPhoneDigits(saved?.phoneDigits ?? loaded.whatsapp.phoneDigits);
    }).catch(() => {
      // A failed request must not leave an empty page behind.
      if (cancelled) return;
      setLoadError("Your plan could not be loaded. Please try again.");
      onReady?.();
    });
    return () => {
      cancelled = true;
    };
  }, [cohortId, maxWeeks, loadAttempt]);

  const hasPlan = context ? hasPlanAnswers(context.answers) : false;

  // First visit with nothing written yet: open the plan popup straight away.
  useEffect(() => {
    if (context && !hasPlan && !autoOpened.current && !activation) {
      autoOpened.current = true;
      setFormOpen(true);
    }
  }, [context, hasPlan, activation]);

  // Show the generating screen while a run is in progress; hide it on an error
  // or when the run is dropped. A fresh mount (activation still null) never
  // hides it, since My Actions may be mid-handoff to the live plan.
  const reportedGenerating = useRef(false);
  useEffect(() => {
    const generating = Boolean(activation && activation.stage !== "error");
    if (generating) {
      reportedGenerating.current = true;
      onGeneratingChange?.(true);
    } else if (reportedGenerating.current) {
      reportedGenerating.current = false;
      onGeneratingChange?.(false);
    }
  }, [activation, onGeneratingChange]);

  const finishActivation = useCallback(async () => {
    if (!cohortId) return;
    setActivation({ stage: "activating" });
    const result = await activatePersonalActionPlan();
    if (result.error) {
      setActivation({ stage: "error", message: result.error });
      return;
    }
    writeStorage(autoActivateKey(cohortId), null);
    writeStorage(setupDraftKey(cohortId), null);
    // The generating screen stays up (stage "activating") while My Actions
    // loads the live plan, then gives way straight to the actions: one loader
    // from Activate to the finished page.
    try {
      await (onActivated ? onActivated() : refetch());
    } catch {
      // The plan is live; a full reload lands on it.
      window.location.reload();
    }
  }, [cohortId, refetch, onActivated]);

  // Reload after clicking Activate: put the generating screen straight back
  // up, so the plan card doesn't show in between while we check on the run.
  useLayoutEffect(() => {
    if (cohortId && readStorage<boolean>(autoActivateKey(cohortId))) {
      setActivation((current) => current ?? { stage: "starting" });
    }
  }, [cohortId]);

  // ...then pick the run back up from where it is.
  useEffect(() => {
    if (!cohortId || !context || resumeChecked.current) return;
    if (!readStorage<boolean>(autoActivateKey(cohortId))) {
      resumeChecked.current = true;
      return;
    }
    // The draft can still be on its way; wait for the store to load it.
    if (personalPlanState === "none" && isLoading) return;
    resumeChecked.current = true;
    if (personalPlanState !== "draft") {
      // Nothing to resume (never saved, or already active).
      writeStorage(autoActivateKey(cohortId), null);
      setActivation(null);
      return;
    }
    void refreshGenerationStatus().then((job) => {
      if (job?.status === "generating") {
        ourJobId.current = job.id;
        setActivation({ stage: "generating" });
      } else if (job?.status === "failed") {
        setActivation({ stage: "error", message: job.errorMessage ?? "Your actions could not be created. Please try again." });
      } else {
        void finishActivation();
      }
    }).catch(() => undefined);
  }, [cohortId, context, personalPlanState, isLoading, refreshGenerationStatus, finishActivation]);

  // The store polls generation every few seconds; activate once our job settles.
  useEffect(() => {
    if (activation?.stage !== "generating" || !ourJobId.current) return;
    if (generationError) {
      setActivation({ stage: "error", message: generationError });
      if (cohortId) writeStorage(autoActivateKey(cohortId), null);
      return;
    }
    if (generationJob?.id === ourJobId.current) return;
    void finishActivation();
  }, [activation?.stage, generationJob, generationError, finishActivation, cohortId]);

  async function savePlan(values: PlanFormValues): Promise<string | void> {
    if (!context || !cohortId) return "Your batch isn't loaded yet. Please try again.";
    // One question now drives the plan, so earlier extra answers are cleared.
    const answers: MyPlanAnswers = {
      ...context.answers,
      name: profile.name,
      designation: values.designation,
      skillGoal: values.skillGoal,
      dailyWork: "",
      practiceOpportunities: "",
    };
    const result = await saveMySessionNotes(answers, cohortId);
    if (result.error) return result.error;
    setContext({ ...context, answers });
    setWhatsappOn(values.whatsappOn);
    setPhoneDigits(values.phoneDigits);
    writeStorage(setupDraftKey(cohortId), { setup, whatsappOn: values.whatsappOn, phoneDigits: values.phoneDigits });
    setFormOpen(false);
  }

  /** "Refine with AI" in the plan popup: clearer wording for review; nothing is saved yet. */
  async function refinePlan(values: PlanFormValues): Promise<{ designation: string; skillGoal: string } | string> {
    if (!context || !cohortId) return "Your batch isn't loaded yet. Please try again.";
    const result = await refineMySessionNotes(
      { ...context.answers, name: profile.name, designation: values.designation, skillGoal: values.skillGoal, dailyWork: "", practiceOpportunities: "" },
      cohortId,
      { save: false },
    );
    if (result.error || !result.answers) return result.error ?? "Your plan couldn't be refined. Please try again.";
    return { designation: result.answers.designation, skillGoal: result.answers.skillGoal };
  }

  function saveSetup(values: PlanSetupValues) {
    if (!cohortId) return;
    setSetup(values.setup);
    setWhatsappOn(values.whatsappOn);
    setPhoneDigits(values.phoneDigits);
    writeStorage(setupDraftKey(cohortId), values);
    setSetupOpen(false);
  }

  async function activate() {
    // A failed run can be retried; anything else in progress blocks a second click.
    if (!context || !cohortId || (activation && activation.stage !== "error")) return;
    const sendWhatsapp = whatsappAvailable && whatsappOn;
    if (sendWhatsapp && !isIndianMobile(phoneDigits)) {
      setActivateHint("Add your 10-digit WhatsApp number, or turn WhatsApp reminders off.");
      setFormOpen(true);
      return;
    }
    setActivateHint(null);
    writeStorage(autoActivateKey(cohortId), true);
    setActivation({ stage: "starting" });

    // A draft from the earlier flow that already has its actions, with the
    // same setup: nothing to generate, just switch it on.
    const reuseDraft = personalPlanState === "draft" && draftSetup && sameSetup(setup, draftSetup)
      && draftActionCount > 0 && !generationJob && !generationError;
    if (reuseDraft) {
      await finishActivation();
      return;
    }

    const result = await saveGeneratedActions({
      userNotes: buildUserNotesPayload(context.answers),
      focusThemes: [],
      track: setup.track,
      dailyActionCount: setup.track === "daily" ? 1 : setup.actionCount,
      daysOfWeek: setupDaysOfWeek(setup),
      durationWeeks: setup.durationWeeks,
      emailRemindersEnabled: true,
      whatsappRemindersEnabled: sendWhatsapp,
      whatsappNumber: sendWhatsapp ? `+91${phoneDigits}` : undefined,
    });
    if (result.error) {
      writeStorage(autoActivateKey(cohortId), null);
      setActivation({ stage: "error", message: result.error });
      return;
    }
    try {
      const job = await refreshGenerationStatus();
      ourJobId.current = job?.id ?? null;
    } catch {
      ourJobId.current = null;
    }
    if (!ourJobId.current) {
      setActivation({ stage: "error", message: "We couldn't check on your actions. Please try again." });
      return;
    }
    setActivation({ stage: "generating" });
  }

  if (!cohortId) return null;

  const total = totalPlanActions(setup);
  const reminderLine = setup.track === "daily"
    ? "Weekdays at 11:30 AM"
    : `${PLAN_REMINDER_DAYS.find((day) => day.value === setup.dayOfWeek)?.label ?? "Tuesday"}s at 11:30 AM`;
  const isRecommended = sameSetup(setup, recommendedSetup(maxWeeks));
  const planText = context
    ? context.answers.skillGoal.trim() || [context.answers.dailyWork, context.answers.practiceOpportunities].filter((value) => value.trim()).join(" ")
    : "";

  return (
    <div className="reference-actions plan-setup-page animate-in fade-in duration-700">
      <div className="actions-overview-head">
        <div>
          <h1>Your practice plan</h1>
          {/* <p>{hasPlan ? "One last step: activate your plan and we'll create your actions." : "Your personal practice plan lives here."}</p> */}
        </div>
      </div>

      {loadError && (
        <div className="plan-setup-error" role="alert">
          {loadError}{" "}
          <button type="button" className="plan-setup-retry" onClick={() => setLoadAttempt((n) => n + 1)}>Try again</button>
        </div>
      )}


      {context && !hasPlan && !formOpen && (
        <section className="plan-setup-empty">
          <span className="plan-setup-empty-icon" aria-hidden="true"><FileText size={26} /></span>
          <h2>Start with your plan</h2>
          <p>Answer one question about the skill you want to build. It takes about 2 minutes.</p>
          <button type="button" className="journey-primary-button" onClick={() => setFormOpen(true)}><Pencil size={15} /> Write my plan</button>
        </section>
      )}

      {context && hasPlan && <>
        <div className="plan-setup-grid">
          <section className="plan-setup-card">
            <header>
              <span>Your plan</span>
              <button type="button" onClick={() => setFormOpen(true)}><Pencil size={14} /> Edit</button>
            </header>
            {context.answers.designation && <span className="plan-setup-chip">{context.answers.designation}</span>}
            <blockquote>{planText}</blockquote>
          </section>

          <section className="plan-setup-card">
            <header>
              <span>Your setup <em className={isRecommended ? "is-recommended" : ""}>{isRecommended ? "Recommended" : "Your choice"}</em></span>
              <button type="button" onClick={() => setSetupOpen(true)}><SlidersHorizontal size={14} /> Change</button>
            </header>
            <div className="plan-setup-number"><strong>{total}</strong><span>actions</span></div>
            <p className="plan-setup-formula">
              <b>{setup.track === "daily" ? "1 / weekday" : `${setup.actionCount} / week`}</b> × <b>{setup.durationWeeks} weeks</b> = <b>{total} actions</b>
            </p>
            <ul className="plan-setup-rows">
              <li><CalendarDays size={15} aria-hidden="true" /> Reminders on {reminderLine}</li>
              <li><Mail size={15} aria-hidden="true" /> Emails will come from <b>team@nudgeable.app</b></li>
              <li><Mail size={15} aria-hidden="true" /> Recap email every <b>Friday at 12:30 PM</b></li>
            </ul>
          </section>
        </div>

        <section className="plan-setup-activate">
          <div>
            <strong>Convert plan into actions</strong>
            <p>{activateHint ?? "One last step: activate your plan and we'll create your actions."}</p>
          </div>
          <button type="button" className="journey-primary-button" onClick={() => void activate()} disabled={Boolean(activation)}>
            <Sparkles size={16} /> Activate my plan
          </button>
        </section>
      </>}

      <PlanFormModal
        open={formOpen}
        name={profile.name || firstName}
        initial={{
          designation: context?.answers.designation ?? "",
          skillGoal: context?.answers.skillGoal ?? "",
          phoneDigits,
          whatsappOn,
        }}
        whatsappAvailable={whatsappAvailable}
        onClose={() => setFormOpen(false)}
        onSave={savePlan}
        onRefine={refinePlan}
      />

      <PlanSetupModal
        open={setupOpen}
        initial={{ setup, whatsappOn, phoneDigits }}
        maxWeeks={maxWeeks}
        whatsappAvailable={whatsappAvailable}
        onClose={() => setSetupOpen(false)}
        onSave={saveSetup}
      />

      {activation?.stage === "error" && typeof document !== "undefined" && createPortal(
        <div className="actions-history-overlay plan-activation-overlay">
          <section className="actions-history-modal plan-activation-modal is-error" role="dialog" aria-modal="true" aria-labelledby="plan-activation-title" aria-live="polite">
            <span className="plan-activation-orb" aria-hidden="true"><X size={28} /></span>
            <h2 id="plan-activation-title">We couldn&apos;t finish your plan</h2>
            <p>{activation.message}</p>
            <div className="plan-form-actions plan-activation-actions">
              <button type="button" className="plan-form-cancel" onClick={() => setActivation(null)}>Close</button>
              <button type="button" className="journey-primary-button" onClick={() => void activate()}>Try again</button>
            </div>
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}
