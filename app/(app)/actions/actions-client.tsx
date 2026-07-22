"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CalendarDays, Check, CheckCircle2, ChevronRight, CircleX, Clock3, ListChecks, Medal, Settings2, Trophy, X } from "lucide-react";
import { useEngine } from "@/lib/store";
import { getCohortLeaderboard, type LeaderboardEntry } from "@/app/actions/leaderboard";
import { getMyPlanSettings, type MyPlanSettings } from "@/app/actions/ai-actions";
import { usePageLoading } from "@/components/PageLoadingProvider";
import ConfettiCelebration from "@/components/ConfettiCelebration";

type Tab = "upcoming" | "completed" | "not-completed" | "archived" | "settings";
type ArchivedActionEntry = {
  id: string;
  cohortId: string;
  cohortName: string;
  archivedAt: string;
  theme: string;
  title: string;
  how: string;
  why: string;
  timeEstimate: string;
  status: string | null;
  reflection: string | null;
  scheduledAt: string | null;
};
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatDate(value?: string) {
  if (!value) return "Scheduled by your plan";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(value: string) {
  if (!value) return "Not set";
  const [hours, minutes] = value.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes || 0).padStart(2, "0")} ${suffix}`;
}

function projectedDeliveryDate(settings: MyPlanSettings | null, actionIndex: number) {
  if (!settings?.nextDeliveryAt) return undefined;
  const date = new Date(settings.nextDeliveryAt);
  if (Number.isNaN(date.getTime())) return undefined;
  const periodIndex = Math.floor(actionIndex / Math.max(1, settings.actionCount));
  date.setDate(date.getDate() + periodIndex * (settings.track === "weekly" ? 7 : 1));
  return date.toISOString();
}

async function fetchArchivedActions(): Promise<ArchivedActionEntry[]> {
  const response = await fetch("/api/archived-actions", { cache: "no-store" });
  if (!response.ok) return [];
  const result = await response.json() as { actions?: ArchivedActionEntry[] };
  return result.actions ?? [];
}

function archivedStatusLabel(status: string | null) {
  if (status === "success" || status === "habit_started" || status === "cemented") return "Completed";
  if (status === "skipped") return "Skipped";
  if (status === "failed") return "Didn’t complete";
  if (status === "scheduled") return "Ready to do";
  return "Not started";
}

function archivedActionIsComplete(status: string | null) {
  return status === "success" || status === "habit_started" || status === "cemented";
}

export default function ActionsClient() {
  const { cohort, personalPlanState, allActions, userActions, completeAction } = useEngine();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [celebratingTitle, setCelebratingTitle] = useState<string | null>(null);
  const [reflection, setReflection] = useState("");
  const [busy, setBusy] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [settings, setSettings] = useState<MyPlanSettings | null>(null);
  const [archivedActions, setArchivedActions] = useState<ArchivedActionEntry[]>([]);
  const [archiveReady, setArchiveReady] = useState(false);
  const [ready, setReady] = useState(false);

  usePageLoading(!ready);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    void (async () => {
      const [leaderboardResult, settingsResult] = await Promise.allSettled([
        cohort?.id ? getCohortLeaderboard(cohort.id) : Promise.resolve({ entries: [] as LeaderboardEntry[] }),
        getMyPlanSettings(),
      ]);
      if (cancelled) return;
      setLeaderboard(leaderboardResult.status === "fulfilled" ? leaderboardResult.value.entries ?? [] : []);
      setSettings(settingsResult.status === "fulfilled" ? settingsResult.value.settings : null);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [cohort?.id]);

  useEffect(() => {
    let cancelled = false;
    void fetchArchivedActions()
      .then((actions) => {
        if (!cancelled) setArchivedActions(actions);
      })
      .catch(() => {
        if (!cancelled) setArchivedActions([]);
      })
      .finally(() => {
        if (!cancelled) setArchiveReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const actionMap = useMemo(() => new Map(allActions.map((action) => [action.id, action])), [allActions]);
  const planIsActive = settings?.isActive === true;
  const planIsArchived = settings?.isArchived === true;
  const planCanPerform = planIsActive || planIsArchived;
  const scheduled = planCanPerform ? userActions.filter((item) => item.status === "scheduled" && actionMap.has(item.actionId)) : [];
  const completed = userActions.filter((item) => item.status === "success" && actionMap.has(item.actionId));
  const notCompleted = userActions.filter((item) => (item.status === "failed" || item.status === "skipped") && actionMap.has(item.actionId));
  const usedActionIds = new Set(userActions.map((item) => item.actionId));
  const currentActions = scheduled.map((item) => ({ userAction: item, action: actionMap.get(item.actionId)! }));
  const upcoming = planCanPerform ? allActions.filter((action) => action.isPersonal && !usedActionIds.has(action.id)) : [];

  async function finish(success: boolean) {
    if (!completingId) return;
    const actionTitle =
      actionMap.get(completingId)?.title ??
      archivedActions.find((action) => action.id === completingId)?.title;
    setBusy(true);
    try {
      const result = await completeAction(completingId, success, reflection);
      if (!result.error) {
        try {
          setArchivedActions(await fetchArchivedActions());
        } catch {
          // The selected-cohort store has already refreshed. Keep the existing
          // archive list if its independent refresh is temporarily unavailable.
        }
        setCompletingId(null);
        setReflection("");
        if (success) {
          setCelebratingTitle(actionTitle ?? "Action completed");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  function closeCelebration() {
    setCelebratingTitle(null);
  }

  async function skip(actionId: string) {
    setBusy(true);
    const result = await completeAction(actionId, false, "Skipped");
    setBusy(false);
    if (!result.error) setTab("not-completed");
  }

  if (!ready) return null;

  return <div className="reference-actions animate-in fade-in duration-700">
    <div className="actions-overview-head">
      <div><span className="participant-eyebrow">Workplace practice</span><h1>Your practice plan</h1><p>One action appears when it is due. Completed actions move to your history.</p></div>
      <span className={`actions-plan-badge ${planIsActive ? "active" : ""}`}>{planIsActive ? "Plan active" : planIsArchived ? "Archived plan" : "No active plan"}</span>
    </div>

    <nav className="actions-tabs" aria-label="Action views">
      <button type="button" className={tab === "upcoming" ? "active" : ""} onClick={() => setTab("upcoming")}>Upcoming <span>{scheduled.length}</span></button>
      <button type="button" className={tab === "completed" ? "active" : ""} onClick={() => setTab("completed")}>Completed <span>{completed.length}</span></button>
      <button type="button" className={tab === "not-completed" ? "active" : ""} onClick={() => setTab("not-completed")}>Didn&apos;t complete <span>{notCompleted.length}</span></button>
      <button type="button" className={tab === "archived" ? "active" : ""} onClick={() => setTab("archived")}>Archived <span>{archiveReady ? archivedActions.length : "…"}</span></button>
      <button type="button" className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>Plan overview</button>
    </nav>

    {tab === "upcoming" && <div className="actions-reference-layout">
      <div className="actions-primary-column">
        <section className="actions-current-group">
          <div className="actions-section-heading"><div><h3>Current actions</h3><p>{currentActions.length ? `${currentActions.length} action${currentActions.length === 1 ? " is" : "s are"} ready for this ${settings?.track === "daily" ? "day" : "week"}.` : "Actions ready for your current practice period."}</p></div>{currentActions.length > 0 && <span>{currentActions.length} ready</span>}</div>
          {currentActions.length === 0 ? <div className="actions-current-card"><div className="actions-empty-state"><ListChecks size={28} /><strong>{planIsArchived ? "No released actions remain" : "No action is due right now"}</strong><p>{planIsArchived ? "This archived cohort plan will not release more reminders." : planIsActive ? "Your next action will appear according to this cohort plan's schedule." : personalPlanState === "draft" ? "Finish reviewing and finalise this cohort's draft plan first." : "Build a practice plan for your current cohort to generate workplace actions."}</p>{!planCanPerform && <Link href="/plan" className="journey-primary-button">{personalPlanState === "draft" ? "Review draft plan" : "Build my plan"}</Link>}</div></div> : <div className="actions-current-list">
            {currentActions.map(({ userAction, action }, index) => <article className="actions-current-card" key={userAction.id}>
              <div className="actions-current-top"><span>Current action {currentActions.length > 1 ? index + 1 : ""}</span><em>{action.timeEstimate}</em></div>
              <h2>{action.title}</h2><p>{action.how}</p>
              <div className="actions-why"><strong>Why this works</strong><span>{action.why}</span></div>
              <div className="actions-current-buttons"><button className="journey-primary-button" disabled={busy} onClick={() => setCompletingId(userAction.actionId)}><Check size={16} /> Mark completed</button><button disabled={busy} onClick={() => skip(userAction.actionId)}>Skip for now</button></div>
            </article>)}
          </div>}
        </section>

        <section className="actions-list-card"><h3>{planIsArchived ? "Remaining archived actions" : "Next reminders"}</h3><p>{planIsArchived ? "Reminder delivery is paused. You can still choose and complete any remaining action." : "Actions scheduled after your current action in this cohort plan."}</p><div className="actions-upcoming-list">
          {upcoming.length === 0 && <div className="actions-inline-empty">{planIsArchived ? "No archived actions remain." : "No additional actions are scheduled yet."}</div>}
          {upcoming.map((action, index) => { const deliveryDate = projectedDeliveryDate(settings, index); return <div key={action.id}><b>{index + 1}</b><span><strong>{action.title}</strong><small><Clock3 size={11} /> {action.timeEstimate}{planIsArchived ? " · Available to revisit" : ` · ${formatDate(deliveryDate)}`}</small></span>{planIsArchived ? <button type="button" disabled={busy} onClick={() => setCompletingId(action.id)}>Do this action</button> : <ChevronRight size={16} />}</div>; })}
        </div></section>
      </div>

      <aside className="actions-leaderboard-card"><div className="actions-card-heading"><div><h3>{cohort?.name ?? "Cohort"} leaderboard</h3><p>Points earned from this cohort&apos;s actions only</p></div><Trophy size={20} /></div><div className="actions-leaderboard-list">
        {leaderboard.length === 0 && <div className="actions-inline-empty">No rankings yet.</div>}
        {leaderboard.slice(0, 8).map((entry, index) => <div className={entry.isCurrentUser ? "me" : ""} key={entry.id}><b>{index === 0 ? <Medal size={17} /> : index + 1}</b><i>{entry.name.substring(0, 2).toUpperCase()}</i><span><strong>{entry.name}{entry.isCurrentUser ? " (You)" : ""}</strong><small>{entry.totalPoints} points</small></span></div>)}
      </div></aside>
    </div>}

    {tab === "completed" && <section className="actions-list-card actions-completed-card"><h3>Completed actions</h3><p>A record of the workplace actions you have finished.</p><div className="actions-completed-list">
      {completed.length === 0 && <div className="actions-empty-state"><CheckCircle2 size={28} /><strong>No completed actions yet</strong><p>Your completed workplace actions will appear here.</p></div>}
      {completed.map((item) => { const action = actionMap.get(item.actionId)!; return <div key={item.id}><CheckCircle2 size={19} /><span><strong>{action.title}</strong><small>{item.reflection || "Completed successfully"}</small></span><em>{formatDate(item.scheduledAt || item.scheduledDate)}</em></div>; })}
    </div></section>}

    {tab === "not-completed" && <section className="actions-list-card actions-completed-card"><h3>Actions not completed</h3><p>A record of workplace actions you skipped or could not complete.</p><div className="actions-completed-list actions-not-completed-list">
      {notCompleted.length === 0 && <div className="actions-empty-state"><CircleX size={28} /><strong>No uncompleted actions</strong><p>Actions you don&apos;t complete will appear here.</p></div>}
      {notCompleted.map((item) => { const action = actionMap.get(item.actionId)!; return <div key={item.id}><CircleX size={19} /><span><strong>{action.title}</strong><small>{item.reflection || (item.status === "skipped" ? "Skipped" : "Not completed")}</small></span><em>{formatDate(item.scheduledAt || item.scheduledDate)}</em></div>; })}
    </div></section>}

    {tab === "archived" && <section className="actions-list-card actions-completed-card actions-archive-card"><h3>Archived actions</h3><p>Actions from all your earlier cohort plans stay visible here, whichever cohort you are viewing.</p><div className="actions-archive-list">
      {!archiveReady && <div className="actions-empty-state"><span className="actions-inline-loader" /><strong>Loading archived actions</strong></div>}
      {archiveReady && archivedActions.length === 0 && <div className="actions-empty-state"><ListChecks size={28} /><strong>No archived actions</strong><p>Actions from an earlier cohort will appear here after its plan is archived.</p></div>}
      {archivedActions.map((action) => {
        const isComplete = archivedActionIsComplete(action.status);
        return <article key={action.id}>
          <div className="actions-archive-copy"><div className="actions-archive-meta"><span>{action.cohortName}</span><em>{archivedStatusLabel(action.status)}</em></div><strong>{action.title}</strong><p>{action.how}</p><small><Clock3 size={12} /> {action.timeEstimate} · Archived {formatDate(action.archivedAt)}</small>{action.reflection && <blockquote>{action.reflection}</blockquote>}</div>
          {isComplete ? <CheckCircle2 className="actions-archive-complete" size={21} aria-label="Completed" /> : <button type="button" disabled={busy} onClick={() => setCompletingId(action.id)}>{action.status === "failed" || action.status === "skipped" ? "Try again" : "Do this action"}</button>}
        </article>;
      })}
    </div></section>}

    {tab === "settings" && <section className="actions-list-card actions-settings-card"><div className="actions-card-heading"><div><h3>Plan overview</h3><p>Your current duration, pace and reminder schedule.</p></div><Settings2 size={20} /></div>
      {!settings ? <div className="actions-empty-state"><CalendarDays size={28} /><strong>No plan for this cohort yet</strong><p>Generate, review and finalise your plan before actions appear here.</p>{cohort?.isCurrent && <Link href="/plan" className="journey-primary-button">Go to my plan</Link>}</div> : <><div className="actions-inline-empty">{settings.isArchived ? "Archived · reminders paused · plan settings are read-only" : settings.isActive ? "Finalised · plan settings are read-only" : "Draft · finalise this plan before reminders begin"}</div><div className="actions-settings-grid"><div><span>Action pace</span><strong>{settings.track === "weekly" ? "Weekly actions" : "Daily actions"}</strong></div><div><span>Plan duration</span><strong>{settings.durationWeeks} weeks</strong></div><div><span>Actions per {settings.track === "weekly" ? "week" : "day"}</span><strong>{settings.actionCount}</strong></div><div><span>Reminder</span><strong>{settings.track === "weekly" ? `${DAYS[settings.daysOfWeek[0] ?? 1]}, ` : "Daily, "}{formatTime(settings.reminderTime)}</strong></div><div><span>Total plan</span><strong>{settings.totalActionsPlanned} actions</strong></div></div></>}
    </section>}

    {typeof document !== "undefined" && completingId && createPortal(<div className="actions-checkin-overlay"><div className="actions-checkin-modal"><button onClick={() => setCompletingId(null)}><X size={18} /></button><span className="participant-eyebrow">Action check-in</span><h3>How did this action go?</h3><p>Add a short reflection. It helps you notice what worked and what to adjust.</p><textarea value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="What happened when you tried it?" /><div><button className="journey-primary-button" disabled={busy} onClick={() => finish(true)}>{busy ? "Saving…" : "Complete action"}</button><button disabled={busy} onClick={() => finish(false)}>I didn&apos;t complete it</button></div></div></div>, document.body)}

    {typeof document !== "undefined" && celebratingTitle && createPortal(
      <ConfettiCelebration
        actionTitle={celebratingTitle}
        onContinue={closeCelebration}
        onClose={closeCelebration}
      />,
      document.body,
    )}
  </div>;
}
