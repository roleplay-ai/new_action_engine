"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, ListChecks, Medal, Settings2, Trophy, X } from "lucide-react";
import { useEngine } from "@/lib/store";
import { getCohortLeaderboard, type LeaderboardEntry } from "@/app/actions/leaderboard";
import { getMyPlanSettings, type MyPlanSettings } from "@/app/actions/ai-actions";

type Tab = "upcoming" | "completed" | "settings";
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

export default function ActionsClient() {
  const { profile, cohort, allActions, userActions, completeAction, selfOnboardingCompletedAt } = useEngine();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [reflection, setReflection] = useState("");
  const [busy, setBusy] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [settings, setSettings] = useState<MyPlanSettings | null>(null);

  useEffect(() => {
    if (cohort?.id) getCohortLeaderboard(cohort.id).then((result) => setLeaderboard(result.entries ?? []));
    getMyPlanSettings().then((result) => setSettings(result.settings));
  }, [cohort?.id, profile.totalPoints]);

  const actionMap = useMemo(() => new Map(allActions.map((action) => [action.id, action])), [allActions]);
  const planIsActive = settings?.isActive === true;
  const scheduled = planIsActive ? userActions.filter((item) => item.status === "scheduled" && actionMap.has(item.actionId)) : [];
  const completed = userActions.filter((item) => item.status === "success" && actionMap.has(item.actionId));
  const usedActionIds = new Set(userActions.map((item) => item.actionId));
  const currentActions = scheduled.map((item) => ({ userAction: item, action: actionMap.get(item.actionId)! }));
  const upcoming = planIsActive ? allActions.filter((action) => action.isPersonal && !usedActionIds.has(action.id)) : [];

  async function finish(success: boolean) {
    if (!completingId) return;
    setBusy(true);
    await completeAction(completingId, success, reflection);
    setBusy(false);
    setCompletingId(null);
    setReflection("");
  }

  return <div className="reference-actions animate-in fade-in duration-700">
    <div className="actions-overview-head">
      <div><span className="participant-eyebrow">Workplace practice</span><h1>Your practice plan</h1><p>One action appears when it is due. Completed actions move to your history.</p></div>
      <span className={`actions-plan-badge ${planIsActive ? "active" : ""}`}>{planIsActive ? "Plan active" : "No active plan"}</span>
    </div>

    <nav className="actions-tabs" aria-label="Action views">
      <button className={tab === "upcoming" ? "active" : ""} onClick={() => setTab("upcoming")}>Upcoming <span>{scheduled.length}</span></button>
      <button className={tab === "completed" ? "active" : ""} onClick={() => setTab("completed")}>Completed <span>{completed.length}</span></button>
      <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>Settings</button>
    </nav>

    {tab === "upcoming" && <div className="actions-reference-layout">
      <div className="actions-primary-column">
        <section className="actions-current-group">
          <div className="actions-section-heading"><div><h3>Current actions</h3><p>{currentActions.length ? `${currentActions.length} action${currentActions.length === 1 ? " is" : "s are"} ready for this ${settings?.track === "daily" ? "day" : "week"}.` : "Actions ready for your current practice period."}</p></div>{currentActions.length > 0 && <span>{currentActions.length} ready</span>}</div>
          {currentActions.length === 0 ? <div className="actions-current-card"><div className="actions-empty-state"><ListChecks size={28} /><strong>No action is due right now</strong><p>{selfOnboardingCompletedAt ? "Your next action will appear according to your plan schedule." : "Build a practice plan to generate your first workplace actions."}</p>{!selfOnboardingCompletedAt && <Link href="/plan" className="journey-primary-button">Build my plan</Link>}</div></div> : <div className="actions-current-list">
            {currentActions.map(({ userAction, action }, index) => <article className="actions-current-card" key={userAction.id}>
              <div className="actions-current-top"><span>Current action {currentActions.length > 1 ? index + 1 : ""}</span><em>{action.timeEstimate}</em></div>
              <h2>{action.title}</h2><p>{action.how}</p>
              <div className="actions-why"><strong>Why this works</strong><span>{action.why}</span></div>
              <div className="actions-current-buttons"><button className="journey-primary-button" onClick={() => setCompletingId(userAction.actionId)}><Check size={16} /> Mark completed</button><button onClick={() => { setCompletingId(userAction.actionId); setReflection("Skipped"); }}>Skip for now</button></div>
            </article>)}
          </div>}
        </section>

        <section className="actions-list-card"><h3>Next reminders</h3><p>Actions scheduled after your current action.</p><div className="actions-upcoming-list">
          {upcoming.length === 0 && <div className="actions-inline-empty">No additional actions are scheduled yet.</div>}
          {upcoming.map((action, index) => { const deliveryDate = projectedDeliveryDate(settings, index); return <div key={action.id}><b>{index + 1}</b><span><strong>{action.title}</strong><small><Clock3 size={11} /> {action.timeEstimate} · {formatDate(deliveryDate)}</small></span><ChevronRight size={16} /></div>; })}
        </div></section>
      </div>

      <aside className="actions-leaderboard-card"><div className="actions-card-heading"><div><h3>Cohort leaderboard</h3><p>Based on completed workplace actions</p></div><Trophy size={20} /></div><div className="actions-leaderboard-list">
        {leaderboard.length === 0 && <div className="actions-inline-empty">No rankings yet.</div>}
        {leaderboard.slice(0, 8).map((entry, index) => <div className={entry.isCurrentUser ? "me" : ""} key={entry.id}><b>{index === 0 ? <Medal size={17} /> : index + 1}</b><i>{entry.name.substring(0, 2).toUpperCase()}</i><span><strong>{entry.name}{entry.isCurrentUser ? " (You)" : ""}</strong><small>{entry.totalPoints} points</small></span></div>)}
      </div></aside>
    </div>}

    {tab === "completed" && <section className="actions-list-card actions-completed-card"><h3>Completed actions</h3><p>A record of the workplace actions you have finished.</p><div className="actions-completed-list">
      {completed.length === 0 && <div className="actions-empty-state"><CheckCircle2 size={28} /><strong>No completed actions yet</strong><p>Your completed workplace actions will appear here.</p></div>}
      {completed.map((item) => { const action = actionMap.get(item.actionId)!; return <div key={item.id}><CheckCircle2 size={19} /><span><strong>{action.title}</strong><small>{item.reflection || "Completed successfully"}</small></span><em>{formatDate(item.scheduledAt || item.scheduledDate)}</em></div>; })}
    </div></section>}

    {tab === "settings" && <section className="actions-list-card actions-settings-card"><div className="actions-card-heading"><div><h3>Plan settings</h3><p>Your current duration, pace and reminder schedule.</p></div><Settings2 size={20} /></div>
      {!settings?.isActive ? <div className="actions-empty-state"><CalendarDays size={28} /><strong>No active plan yet</strong><p>Generate, review and finalise your plan before actions appear here.</p><Link href="/plan" className="journey-primary-button">Go to my plan</Link></div> : <><div className="actions-settings-grid"><div><span>Action pace</span><strong>{settings.track === "weekly" ? "Weekly actions" : "Daily actions"}</strong></div><div><span>Plan duration</span><strong>{settings.durationWeeks} weeks</strong></div><div><span>Actions per {settings.track === "weekly" ? "week" : "day"}</span><strong>{settings.actionCount}</strong></div><div><span>Reminder</span><strong>{settings.track === "weekly" ? `${DAYS[settings.daysOfWeek[0] ?? 1]}, ` : "Daily, "}{formatTime(settings.reminderTime)}</strong></div><div><span>Total plan</span><strong>{settings.totalActionsPlanned} actions</strong></div></div><Link href="/plan" className="journey-primary-button">Edit plan</Link></>}
    </section>}

    {typeof document !== "undefined" && completingId && createPortal(<div className="actions-checkin-overlay"><div className="actions-checkin-modal"><button onClick={() => setCompletingId(null)}><X size={18} /></button><span className="participant-eyebrow">Action check-in</span><h3>How did this action go?</h3><p>Add a short reflection. It helps you notice what worked and what to adjust.</p><textarea value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="What happened when you tried it?" /><div><button className="journey-primary-button" disabled={busy} onClick={() => finish(true)}>{busy ? "Saving…" : "Complete action"}</button><button disabled={busy} onClick={() => finish(false)}>I didn&apos;t complete it</button></div></div></div>, document.body)}
  </div>;
}
