"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, CheckCircle2, ChevronDown, ChevronUp, CircleCheckBig, CircleX, Clock3, Coffee, Hand, Handshake, HeartHandshake, ListChecks, Loader2, Mail, Medal, MessageCircle, MessageCircleHeart, Settings2, TrendingDown, TrendingUp, Trophy, UsersRound, X } from "lucide-react";
import { useEngine } from "@/lib/store";
import { getCohortLeaderboard, type LeaderboardEntry } from "@/app/actions/leaderboard";
import { getMyPlanSettings, syncMyDuePersonalActions, type MyPlanSettings } from "@/app/actions/ai-actions";
import {
  getMyCommitmentBuddies,
  markMyCommitmentBuddyRevealed,
  type CommitmentBuddyGroup,
  type CommitmentBuddyProgress,
  type CommitmentBuddyTrack,
} from "@/app/actions/commitment-buddies";
import { getMyCommitmentWallet } from "@/app/actions/commitment-wallet";
import { nextMilestoneFor, milestonePoints } from "@/lib/commitment-wallet-milestones";
import { usePageLoading, usePageLoadingControls } from "@/components/PageLoadingProvider";
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
  return date.toLocaleDateString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
  if (settings.track === "weekly") {
    date.setUTCDate(date.getUTCDate() + periodIndex * 7);
  } else {
    let weekdaysToAdd = periodIndex;
    while (weekdaysToAdd > 0) {
      date.setUTCDate(date.getUTCDate() + 1);
      const weekday = date.getUTCDay();
      if (weekday !== 0 && weekday !== 6) weekdaysToAdd -= 1;
    }
  }
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

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "CM";
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : parts[0]?.[1] ?? ""}`.toUpperCase();
}

/** Displays as a whole number; the underlying score keeps decimal precision in calculations. */
function formatCommitmentScore(value: number) {
  const clamped = Math.min(100, Math.max(0, value));
  return String(Math.round(clamped));
}

type BuddyCardState = "pending-plan" | "new" | "dipped" | "steady";

function buddyCardState(buddy: CommitmentBuddyProgress): BuddyCardState {
  if (!buddy.hasFinalisedPlan || buddy.currentScore === null) return "pending-plan";
  if (buddy.previousScore === null) return "new";
  return buddy.currentScore < buddy.previousScore ? "dipped" : "steady";
}

function buddyPeriodLabels(track: CommitmentBuddyTrack) {
  if (track === "daily") return { previous: "Yesterday", current: "Today", sincePhrase: "since yesterday" };
  if (track === "weekly") return { previous: "Last week", current: "This week", sincePhrase: "this week" };
  return { previous: "Last period", current: "Current", sincePhrase: "recently" };
}

function buddyStateMessage(buddy: CommitmentBuddyProgress, state: BuddyCardState) {
  const firstName = buddy.name.split(/\s+/)[0] || buddy.name;
  const { sincePhrase } = buddyPeriodLabels(buddy.track);
  if (state === "pending-plan") return `${firstName} hasn't finalised their Wallet plan yet.`;
  if (state === "new") return `${firstName} just finalised their plan — no comparison yet.`;
  if (state === "dipped") return `${firstName}'s commitment has dipped ${sincePhrase}.`;
  return `${firstName} is keeping their commitment steady.`;
}

function buddyContactCopy(buddy: CommitmentBuddyProgress, state: BuddyCardState) {
  const firstName = buddy.name.split(/\s+/)[0] || buddy.name;
  const { sincePhrase } = buddyPeriodLabels(buddy.track);
  if (state === "pending-plan") {
    return {
      label: `Say hi to ${firstName}`,
      title: `Say hi to ${firstName}`,
      message: `Hi ${firstName}, just checking in — let me know if you need a hand finalising your Action plan.`,
    };
  }
  if (state === "new") {
    return {
      label: `Say hi to ${firstName}`,
      title: `Say hi to ${firstName}`,
      message: `Hi ${firstName}, saw you just finalised your Action plan — excited to keep each other on track!`,
    };
  }
  if (state === "dipped") {
    return {
      label: `Check in with ${firstName}`,
      title: `Check in with ${firstName}`,
      message: `Hi ${firstName}, I noticed your Commitment Score dipped ${sincePhrase}. Just checking in to see how things are going. Anything I can help with?`,
    };
  }
  return {
    label: `Congratulate ${firstName}`,
    title: `Congratulate ${firstName}`,
    message: `Hi ${firstName}, great to see you keeping your Commitment Score steady ${sincePhrase}. Nice work keeping the momentum going!`,
  };
}

function CommitmentBuddyScoreCard({
  buddy,
  onContact,
}: {
  buddy: CommitmentBuddyProgress;
  onContact: (buddy: CommitmentBuddyProgress) => void;
}) {
  const state = buddyCardState(buddy);
  const labels = buddyPeriodLabels(buddy.track);
  const contact = buddyContactCopy(buddy, state);
  const isSayHi = state === "new" || state === "pending-plan";
  const cardClass = state === "dipped" ? " dipped" : state === "steady" ? " steady" : "";
  const previousOrbText = buddy.previousScore === null
    ? (buddy.currentScore === null ? "—" : "New")
    : `${formatCommitmentScore(buddy.previousScore)}%`;
  const currentOrbText = buddy.currentScore === null ? "—" : `${formatCommitmentScore(buddy.currentScore)}%`;

  return <section className={`commitment-buddy-card${cardClass}`} aria-label={`Commitment score for ${buddy.name}`}>
    <div className="commitment-buddy-card-head">
      <div className="commitment-buddy-avatar" aria-hidden="true">{initials(buddy.name)}</div>
      <div className="commitment-buddy-identity">
        <p className="commitment-buddy-eyebrow">Your Commitment Buddy</p>
        <h3 className="commitment-buddy-name">{buddy.name}</h3>
        <p className="commitment-buddy-relation">You are each other&apos;s buddy</p>
      </div>
      <span className="commitment-buddy-tag">1-to-1</span>
    </div>

    <div className="commitment-buddy-score-panel" aria-label="Commitment score comparison">
      <div className="commitment-buddy-score-flow">
        <div className="commitment-buddy-score-block">
          <span className="commitment-buddy-score-label">{labels.previous}</span>
          <div className={`commitment-buddy-score-orb${buddy.previousScore === null ? " commitment-buddy-score-orb--empty" : ""}`}>{previousOrbText}</div>
        </div>
        <div className="commitment-buddy-flow-arrow" aria-hidden="true">
          {state === "dipped" ? <TrendingDown size={17} strokeWidth={2.4} /> : <TrendingUp size={17} strokeWidth={2.4} />}
        </div>
        <div className="commitment-buddy-score-block is-current">
          <span className="commitment-buddy-score-label">{labels.current}</span>
          <div className={`commitment-buddy-score-orb${buddy.currentScore === null ? " commitment-buddy-score-orb--empty" : ""}`}>{currentOrbText}</div>
        </div>
      </div>
    </div>

    <div className="commitment-buddy-state-row">
      <span className="commitment-buddy-state-icon" aria-hidden="true">
        {state === "dipped" ? <TrendingDown size={14} strokeWidth={2.4} /> : <CheckCircle2 size={14} strokeWidth={2.4} />}
      </span>
      <span>{buddyStateMessage(buddy, state)}</span>
    </div>

    <button type="button" className="commitment-buddy-contact" onClick={() => onContact(buddy)}>
      {isSayHi ? <Hand size={16} strokeWidth={2.4} /> : <MessageCircle size={16} strokeWidth={2.4} />}
      <span>{contact.label}</span>
    </button>
  </section>;
}

function CommitmentBuddyCard({
  group,
  onContact,
}: {
  group: CommitmentBuddyGroup;
  onContact: (buddy: CommitmentBuddyProgress) => void;
}) {
  if (group.buddies.length === 0) {
    return <section className="commitment-buddy-card actions-buddy-waiting">
      <div className="actions-buddy-waiting-icon"><UsersRound size={21} /></div>
      <div><span>Your commitment buddy</span><strong>Waiting for another batch member</strong><p>Your pairing will appear here as soon as another unpaired participant joins.</p></div>
    </section>;
  }

  return <>
    {group.buddies.map((buddy) => <CommitmentBuddyScoreCard key={buddy.id} buddy={buddy} onContact={onContact} />)}
  </>;
}

type ReminderPreviewAction = {
  title: string;
  how: string;
  timeEstimate: string;
};

function ReminderEmailPreview({
  firstName,
  action,
  hasFinalisedPlan,
  commitmentScore,
  buddyName,
  buddyScore,
  teamRank,
  teamSize,
  teamPoints,
  teamMaximumPoints,
}: {
  firstName: string;
  action: ReminderPreviewAction;
  hasFinalisedPlan: boolean;
  commitmentScore: number | null;
  buddyName: string | null;
  buddyScore: number | null;
  teamRank: number | null;
  teamSize: number | null;
  teamPoints: number;
  teamMaximumPoints: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const nextMilestone = nextMilestoneFor(teamPoints, teamMaximumPoints);
  const milestoneThreshold = nextMilestone ? milestonePoints(teamMaximumPoints, nextMilestone.percent) : 0;
  const milestoneProgress = milestoneThreshold > 0
    ? Math.min(100, Math.max(0, Math.round((teamPoints / milestoneThreshold) * 100)))
    : 0;

  return <section className={`actions-reminder-preview${expanded ? " is-open" : ""}`} aria-label="Sample action reminder email">
    <button
      type="button"
      className="actions-reminder-preview-toggle"
      aria-expanded={expanded}
      onClick={() => setExpanded((open) => !open)}
    >
      <div>
        <span>Sample email preview</span>
        <h3>Your reminder email</h3>
        <p>See how your next action reminder will arrive.</p>
      </div>
      <span className="actions-reminder-preview-toggle-icons">
        <i aria-hidden="true"><Mail size={17} /></i>
        {expanded ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
      </span>
    </button>

    {expanded && <>
      <div className="actions-reminder-subject">
        <span>Subject</span>
        <strong>Hi {firstName} — Your next action is ready</strong>
      </div>

      <div className="actions-reminder-email">
        <div className="actions-reminder-email-hero">
          <span>Your action reminder</span>
          <h4>Your next actions<strong>are ready.</strong></h4>
          <p>Hey {firstName}, your next actions are ready when you are.</p>
        </div>
        <div className="actions-reminder-email-body">
          <div className="actions-reminder-metrics">
            <div className="actions-reminder-metric">
              <i aria-hidden="true">&#10003;</i>
              <strong>{hasFinalisedPlan && commitmentScore !== null ? `${formatCommitmentScore(commitmentScore)}%` : "—"}</strong>
              <span>Your Commitment Score</span>
            </div>
            <div className="actions-reminder-metric actions-reminder-metric--buddy">
              <i aria-hidden="true">&#8596;</i>
              <strong>{buddyName && buddyScore !== null ? `${formatCommitmentScore(buddyScore)}%` : "—"}</strong>
              <span>{buddyName ? `${buddyName} · Your Buddy` : "No buddy yet"}</span>
            </div>
            <div className="actions-reminder-metric actions-reminder-metric--rank">
              <i aria-hidden="true">&#9733;</i>
              <strong>{teamRank !== null && teamSize !== null ? <>{teamRank}<em> / {teamSize}</em></> : "—"}</strong>
              <span>Team Contribution Rank</span>
            </div>
          </div>

          <p className="actions-reminder-email-section-label">Your actions</p>
          <article className="actions-reminder-email-action">
            <i aria-hidden="true">→</i>
            <strong>{action.title}</strong>
          </article>

          <div className="actions-reminder-email-tip"><strong>Done an action?</strong> Open My Actions and mark it complete in one click to update your Commitment Score and add points to your team.</div>

          <span className="actions-reminder-email-button">Open My Actions</span>

          <div className="actions-reminder-email-reward">
            <i aria-hidden="true">{nextMilestone ? nextMilestone.icon : teamMaximumPoints === 0 ? "⏳" : "🎉"}</i>
            <div>
              {teamMaximumPoints === 0 ? (
                <strong>Waiting for finalised plans</strong>
              ) : nextMilestone ? (
                <>
                  <small>Next team reward</small>
                  <strong>{nextMilestone.headline}</strong>
                  <div className="actions-reminder-email-reward-bar"><span style={{ width: `${milestoneProgress}%` }} /></div>
                </>
              ) : (
                <strong>Every current reward unlocked!</strong>
              )}
            </div>
          </div>
        </div>
        <div className="actions-reminder-email-footer">Powered by <b>Nudgeable.ai</b></div>
      </div>

      <p className="actions-reminder-preview-note"><span aria-hidden="true" /> Preview only · no email has been sent.</p>
    </>}
  </section>;
}

export default function ActionsClient() {
  const router = useRouter();
  const { profile, cohort, personalPlanState, allActions, userActions, completeAction, refetch } = useEngine();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{
    title: string;
    pointsDelta?: number;
    completedLate?: boolean;
  } | null>(null);
  const [reflection, setReflection] = useState("");
  const [busy, setBusy] = useState(false);
  const [skippingId, setSkippingId] = useState<string | null>(null);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [settings, setSettings] = useState<MyPlanSettings | null>(null);
  const [buddyGroup, setBuddyGroup] = useState<CommitmentBuddyGroup | null>(null);
  const [buddyReady, setBuddyReady] = useState(false);
  const [contactBuddy, setContactBuddy] = useState<CommitmentBuddyProgress | null>(null);
  const [archivedActions, setArchivedActions] = useState<ArchivedActionEntry[]>([]);
  const [archiveReady, setArchiveReady] = useState(false);
  const [ready, setReady] = useState(false);
  const [commitmentScore, setCommitmentScore] = useState<{
    hasFinalisedPlan: boolean;
    score: number;
    contributionRank: number;
    teamMemberCount: number;
    teamPoints: number;
    teamMaximumPoints: number;
  } | null>(null);

  usePageLoading(!ready);
  const { beginNavigation } = usePageLoadingControls();

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setBuddyReady(false);
    void (async () => {
      // These five calls are independent of each other, so run them together
      // instead of waiting on the due-actions sync before starting the rest —
      // and pass the cohort we already resolved via useEngine() so none of them
      // has to re-derive "which cohort" from scratch.
      const [syncResult, leaderboardResult, settingsResult, buddyResult, walletResult] = await Promise.allSettled([
        // Release any batch whose IST delivery date is today or earlier, so
        // Current actions does not wait for the once-daily cron.
        syncMyDuePersonalActions(cohort?.id),
        cohort?.id ? getCohortLeaderboard(cohort.id) : Promise.resolve({ entries: [] as LeaderboardEntry[] }),
        getMyPlanSettings(cohort?.id),
        cohort?.id ? getMyCommitmentBuddies(cohort.id) : Promise.resolve({ group: null }),
        getMyCommitmentWallet(cohort?.id),
      ]);
      if (cancelled) return;
      const assigned = syncResult.status === "fulfilled" ? syncResult.value.assigned : 0;
      if (assigned > 0) await refetch();
      if (cancelled) return;
      setLeaderboard(leaderboardResult.status === "fulfilled" ? leaderboardResult.value.entries ?? [] : []);
      setSettings(settingsResult.status === "fulfilled" ? settingsResult.value.settings : null);
      setBuddyGroup(buddyResult.status === "fulfilled" ? buddyResult.value.group : null);
      if (walletResult.status === "fulfilled") {
        setCommitmentScore({
          hasFinalisedPlan: walletResult.value.summary.hasFinalisedPlan,
          score: walletResult.value.summary.commitmentScore,
          contributionRank: walletResult.value.summary.contributionRank,
          teamMemberCount: walletResult.value.summary.teamMemberCount,
          teamPoints: walletResult.value.summary.teamPoints,
          teamMaximumPoints: walletResult.value.summary.teamMaximumPoints,
        });
      } else {
        setCommitmentScore(null);
      }
      setBuddyReady(true);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [cohort?.id, refetch]);

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
  const reminderAction: ReminderPreviewAction = currentActions[0]?.action ?? upcoming[0] ?? allActions[0] ?? {
    title: "Turn one learning into a question",
    how: "Before your next conversation, write one open question that helps you understand the other person's perspective.",
    timeEstimate: "10 minutes",
  };
  const reminderFirstName = profile.name.trim().split(/\s+/)[0] || "there";

  async function finish(success: boolean) {
    if (!completingId) return;
    const actionTitle =
      actionMap.get(completingId)?.title ??
      archivedActions.find((action) => action.id === completingId)?.title;
    setBusy(true);
    setCompleteError(null);
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
          setCelebration({
            title: actionTitle ?? "Action completed",
            pointsDelta: result.pointsDelta,
            completedLate: result.completedLate,
          });
        }
      } else {
        console.error("completeAction failed:", result.error);
        setCompleteError(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  function closeCelebration() {
    setCelebration(null);
    router.push("/wallet");
  }

  /** "Done" on the celebration popup — shows the coin-drop-into-bucket loader while it transfers to the Commitment Points. */
  function continueFromCelebration() {
    setCelebration(null);
    beginNavigation("/wallet", "wallet");
    router.push("/wallet");
  }

  function dismissBuddyReveal() {
    if (!cohort?.id) return;
    setBuddyGroup((current) => current ? { ...current, revealPending: false } : current);
    void markMyCommitmentBuddyRevealed(cohort.id);
  }

  async function skip(actionId: string) {
    setBusy(true);
    setSkippingId(actionId);
    try {
      const result = await completeAction(actionId, false, "Skipped");
      if (!result.error) setTab("not-completed");
    } finally {
      setBusy(false);
      setSkippingId(null);
    }
  }

  if (!ready) return null;

  return <div className="reference-actions animate-in fade-in duration-700">
    <div className="actions-overview-head">
      <div>
        <h1>
          Your practice plan
          {planIsActive ? <span className="actions-plan-live-dot" aria-label="Plan active" role="status" /> : null}
        </h1>
        <p>One action appears when it is due. Completed actions move to your history.</p>
      </div>
    </div>

    <nav className="actions-tabs" aria-label="Action views">
      <button type="button" className={tab === "upcoming" ? "active" : ""} onClick={() => setTab("upcoming")}>Upcoming <span>{scheduled.length}</span></button>
      <button type="button" className={tab === "completed" ? "active" : ""} onClick={() => setTab("completed")}>Completed <span>{completed.length}</span></button>
      <button type="button" className={tab === "not-completed" ? "active" : ""} onClick={() => setTab("not-completed")}>Didn&apos;t complete <span>{notCompleted.length}</span></button>
      <button type="button" className={tab === "archived" ? "active" : ""} onClick={() => setTab("archived")}>Archived <span>{archiveReady ? archivedActions.length : "…"}</span></button>
      <button type="button" className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>Plan overview</button>
    </nav>

    {tab === "upcoming" && <div className="actions-reference-layout">
      <section className="actions-current-group">
        <div className="actions-section-heading">
          <div>
            <h3>Current actions</h3>
            <p>
              {currentActions.length
                ? `${currentActions.length} action${currentActions.length === 1 ? " is" : "s are"} ready for this ${settings?.track === "daily" ? "day" : "week"}.`
                : planIsActive
                  ? "Nothing on your plate right now."
                  : "Actions ready for your current practice period."}
            </p>
          </div>
          {currentActions.length > 0 && <span>{currentActions.length} ready</span>}
        </div>
        {currentActions.length === 0 ? (
          <div className="actions-current-card actions-current-card--empty">
            <div className="actions-empty-state actions-empty-state--chill">
              <span className="actions-chill-icon" aria-hidden="true">
                <Coffee size={34} strokeWidth={1.75} />
                <i className="actions-chill-steam" />
                <i className="actions-chill-steam" />
                <i className="actions-chill-steam" />
              </span>
              <strong>
                {planIsArchived
                  ? "No released actions remain"
                  : "So efficient!"}
              </strong>
              <p>
                {planIsArchived
                  ? "This archived batch plan will not release more reminders."
                  : planIsActive || planCanPerform
                    ? "You have completed all your actions! It's time to log out"
                    : personalPlanState === "draft"
                      ? "Finish reviewing and finalise this batch's draft plan first."
                      : "Build a practice plan for your current batch to generate workplace actions."}
              </p>
            </div>
          </div>
        ) : (
          <div className="actions-current-list" style={{ "--action-cols": Math.min(currentActions.length, 3) } as CSSProperties}>
            {currentActions.map(({ userAction, action }, index) => <article className="actions-current-card" key={userAction.id}>
              <div className="actions-current-top"><span>Action # {(action.planOrder ?? index) + 1}</span><em>{action.timeEstimate}{action.planPoints ? ` · Protect ${action.planPoints} points today` : ""}</em></div>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "bold" }}>{action.title}</h3>
              <p style={{ fontSize: "1rem", fontWeight: "normal" }}>{action.how}</p>
              <p style={{ fontSize: "1rem", fontWeight: "normal" }}><span style={{ fontWeight: "bold" }}>Why? </span>{action.why}</p>
              <div className="actions-current-buttons">
                <button className="journey-primary-button" disabled={busy} onClick={() => setCompletingId(userAction.actionId)}><Check size={16} /> I did it</button>
                <button type="button" disabled={busy} aria-busy={skippingId === userAction.actionId} onClick={() => void skip(userAction.actionId)}>
                  {skippingId === userAction.actionId ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Saving…</> : "I didn't complete it"}
                </button>
              </div>
            </article>)}
          </div>
        )}
      </section>

      <hr className="actions-section-divider" />

      <div className={`actions-secondary-row${planIsActive && buddyReady && buddyGroup ? "" : " actions-secondary-row--solo"}`}>
        <section className={`actions-list-card${!planCanPerform && upcoming.length === 0 ? " actions-list-card--empty-reminders" : ""}`}>
          {planCanPerform || upcoming.length > 0 ? (
            <>
              <h3>{planIsArchived ? "Remaining archived actions" : "Next reminders"}</h3>
              <p>{planIsArchived
                ? "Reminder delivery is paused. You can still choose and complete any remaining action."
                : "Actions scheduled after your current action in this batch plan."}</p>
              <div className="actions-upcoming-list plan-review-list">
                {upcoming.length === 0 && <div className="actions-inline-empty">{planIsArchived ? "No archived actions remain." : "No additional actions are scheduled yet."}</div>}
                {upcoming.map((action, index) => {
                  const deliveryDate = projectedDeliveryDate(settings, index);
                  const points = action.planPoints ?? 50;
                  return <article className={`plan-review-action${planIsArchived ? "" : " plan-review-action--reminder"}`} key={action.id}>
                    <div className="plan-action-order"><div className="plan-action-number">{index + 1}</div></div>
                    <div className="plan-action-copy plan-action-copy--compact">
                      <h3 title={action.title}>{action.title}</h3>
                      <div className="plan-action-meta">
                        <span><CalendarDays size={13} />{planIsArchived ? "Available to revisit" : formatDate(deliveryDate)}</span>
                        <span className="plan-action-points">{points}<i className="plan-gold-coin" aria-hidden="true" /></span>
                      </div>
                    </div>
                    {planIsArchived && <div className="plan-action-controls plan-action-controls--compact"><button type="button" disabled={busy} onClick={() => setCompletingId(action.id)}>Do this action</button></div>}
                  </article>;
                })}
              </div>
            </>
          ) : (
            <div className="actions-reminders-empty">
              <div className="actions-reminders-empty-icon" aria-hidden="true"><CalendarDays size={26} /></div>
              <span className="participant-eyebrow">Next reminders</span>
              <strong>{personalPlanState === "draft" ? "Activate your plan to unlock reminders" : "Your reminders will live here"}</strong>
              <p>{personalPlanState === "draft"
                ? "You already have a draft. Finalise it and this space will fill with the actions waiting on your schedule."
                : "Once you create workplace actions in My Plan, upcoming reminders will appear here on the days they are due."}</p>
              <Link href="/plan" className="journey-primary-button">{personalPlanState === "draft" ? "Review draft plan" : "Create my actions"}</Link>
            </div>
          )}
        </section>

        {planIsActive && buddyReady && buddyGroup && (
          <aside className="actions-buddy-sidebar">
            <CommitmentBuddyCard group={buddyGroup} onContact={setContactBuddy} />
            <ReminderEmailPreview
              firstName={reminderFirstName}
              action={reminderAction}
              hasFinalisedPlan={commitmentScore?.hasFinalisedPlan ?? false}
              commitmentScore={commitmentScore?.score ?? null}
              buddyName={buddyGroup?.buddies[0]?.name ?? null}
              buddyScore={buddyGroup?.buddies[0]?.currentScore ?? null}
              teamRank={commitmentScore?.contributionRank ?? null}
              teamSize={commitmentScore?.teamMemberCount ?? null}
              teamPoints={commitmentScore?.teamPoints ?? 0}
              teamMaximumPoints={commitmentScore?.teamMaximumPoints ?? 0}
            />
          </aside>
        )}
      </div>

      {/* <aside className="actions-leaderboard-card"><div className="actions-card-heading"><div><h3>{cohort?.name ?? "Cohort"} leaderboard</h3><p>Current cohort balance · everyone starts at 1,000</p></div><Trophy size={20} /></div><div className="actions-leaderboard-list">
        {leaderboard.length === 0 && <div className="actions-inline-empty">No rankings yet.</div>}
        {leaderboard.slice(0, 8).map((entry, index) => <div className={entry.isCurrentUser ? "me" : ""} key={entry.id}><b>{index === 0 ? <Medal size={17} /> : index + 1}</b><i>{entry.name.substring(0, 2).toUpperCase()}</i><span><strong>{entry.name}{entry.isCurrentUser ? " (You)" : ""}</strong><small>{entry.totalPoints} points</small></span></div>)}
      </div></aside> */}
    </div>}

    {tab === "completed" && <section className="actions-list-card actions-completed-card"><h3>Completed actions</h3><p>A record of the workplace actions you have finished.</p><div className="actions-completed-list">
      {completed.length === 0 && <div className="actions-empty-state"><CheckCircle2 size={28} /><strong>No completed actions yet</strong><p>Your completed workplace actions will appear here.</p></div>}
      {completed.map((item) => { const action = actionMap.get(item.actionId)!; return <div key={item.id}><CheckCircle2 size={19} /><span><strong>{action.title}</strong><small>{item.completedLate ? `Completed late · no Wallet points${item.reflection ? ` · ${item.reflection}` : ""}` : `Completed on time${item.pointsDelta ? ` · +${item.pointsDelta} points` : ""}${item.reflection ? ` · ${item.reflection}` : ""}`}</small></span><em>{formatDate(item.completedAt || item.scheduledAt || item.scheduledDate)}</em></div>; })}
    </div></section>}

    {tab === "not-completed" && <section className="actions-list-card actions-completed-card"><h3>Actions not completed</h3><p>A record of workplace actions you skipped or could not complete.</p><div className="actions-completed-list actions-not-completed-list">
      {notCompleted.length === 0 && <div className="actions-empty-state"><CircleX size={28} /><strong>No uncompleted actions</strong><p>Actions you don&apos;t complete will appear here.</p></div>}
      {notCompleted.map((item) => { const action = actionMap.get(item.actionId)!; return <div key={item.id}><CircleX size={19} /><span><strong>{action.title}</strong><small>{item.pointsDelta && item.pointsDelta < 0 ? `${item.pointsDelta} points · ` : ""}{item.reflection || (item.status === "skipped" ? "Skipped" : "Not completed")}</small></span><em>{formatDate(item.scheduledAt || item.scheduledDate)}</em><button type="button" disabled={busy} onClick={() => setCompletingId(item.actionId)}>Complete late</button></div>; })}
    </div></section>}

    {tab === "archived" && <section className="actions-list-card actions-completed-card actions-archive-card"><h3>Archived actions</h3><p>Actions from all your earlier batch plans stay visible here, whichever batch you are viewing.</p><div className="actions-archive-list">
      {!archiveReady && <div className="actions-empty-state"><span className="actions-inline-loader" /><strong>Loading archived actions</strong></div>}
      {archiveReady && archivedActions.length === 0 && <div className="actions-empty-state"><ListChecks size={28} /><strong>No archived actions</strong><p>Actions from an earlier batch will appear here after its plan is archived.</p></div>}
      {archivedActions.map((action) => {
        const isComplete = archivedActionIsComplete(action.status);
        return <article key={action.id}>
          <div className="actions-archive-copy"><div className="actions-archive-meta"><span>{action.cohortName}</span><em>{archivedStatusLabel(action.status)}</em></div><strong>{action.title}</strong><p>{action.how}</p><small><Clock3 size={12} /> {action.timeEstimate} · Archived {formatDate(action.archivedAt)}</small>{action.reflection && <blockquote>{action.reflection}</blockquote>}</div>
          {isComplete ? <CheckCircle2 className="actions-archive-complete" size={21} aria-label="Completed" /> : <button type="button" disabled={busy} onClick={() => setCompletingId(action.id)}>{action.status === "failed" || action.status === "skipped" ? "Try again" : "Do this action"}</button>}
        </article>;
      })}
    </div></section>}

    {tab === "settings" && <section className="actions-list-card actions-settings-card"><div className="actions-card-heading"><div><h3>Plan overview</h3><p>Your current duration, pace and reminder schedule.</p></div><Settings2 size={20} /></div>
      {!settings ? <div className="actions-empty-state"><CalendarDays size={28} /><strong>No plan for this batch yet</strong><p>Generate, review and finalise your plan before actions appear here.</p>{cohort?.isCurrent && <Link href="/plan" className="journey-primary-button">Go to my plan</Link>}</div> : <><div className="actions-inline-empty">{settings.isArchived ? "Archived · reminders paused · plan settings are read-only" : settings.isActive ? "Finalised · plan settings are read-only" : "Draft · finalise this plan before reminders begin"}</div><div className="actions-settings-grid"><div><span>Action pace</span><strong>{settings.track === "weekly" ? "Weekly actions" : "Daily actions"}</strong></div><div><span>Plan duration</span><strong>{settings.durationWeeks} weeks</strong></div><div><span>Actions per {settings.track === "weekly" ? "week" : "weekday"}</span><strong>{settings.actionCount}</strong></div><div><span>Reminder</span><strong>{settings.track === "weekly" ? `${DAYS[settings.daysOfWeek[0] ?? 1]}, ` : "Weekdays, "}{formatTime(settings.reminderTime)}</strong></div><div><span>Email notifications</span><strong className="actions-notification-status"><Mail size={15} />Email reminders on</strong></div><div><span>Total plan</span><strong>{settings.totalActionsPlanned} actions</strong></div><div><span>Starting points</span><strong>1,000</strong></div><div><span>Minimum score</span><strong>0</strong></div></div><p className="actions-points-rule">Every action is worth 50 points. Complete it on the assigned day to earn 100 points. Missing it deducts 50 points, and your balance never drops below zero. A late completion does not restore the deduction.</p></>}
    </section>}

    {typeof document !== "undefined" && planIsActive && buddyGroup?.revealPending && buddyGroup.buddies.length > 0 && createPortal((() => {
      const primaryBuddy = buddyGroup.buddies[0];
      const buddyNames = buddyGroup.buddies.map((buddy) => buddy.name);
      const buddyLabel = buddyNames.length === 1
        ? buddyNames[0]
        : buddyNames.slice(0, -1).join(", ") + " and " + buddyNames[buddyNames.length - 1];
      const firstNames = buddyGroup.buddies.map((buddy) => buddy.name.split(/\s+/)[0] || buddy.name);
      const helloNames = firstNames.length === 1
        ? firstNames[0]
        : firstNames.slice(0, -1).join(", ") + " and " + firstNames[firstNames.length - 1];
      const pairingLabel = buddyGroup.buddies.length === 1
        ? `You and ${primaryBuddy.name} are commitment buddies`
        : `You, ${buddyLabel} are commitment buddies`;

      return <div
        className="commitment-buddy-popup-overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) dismissBuddyReveal();
        }}
      >
        <section className="commitment-buddy-popup" role="dialog" aria-modal="true" aria-labelledby="commitment-buddy-title">
          <div className="commitment-buddy-popup-identity">
            <p className="commitment-buddy-popup-label">{buddyGroup.buddies.length === 1 ? "Your commitment buddy" : "Your commitment buddies"}</p>

            <div className="commitment-buddy-popup-pairing" aria-label={pairingLabel}>
              <div className="commitment-buddy-popup-avatar" aria-label="You">{initials(profile.name)}</div>
              <div className="commitment-buddy-popup-link" aria-hidden="true"><Handshake size={16} /></div>
              {buddyGroup.buddies.map((buddy) => (
                <div className="commitment-buddy-popup-avatar is-buddy" aria-label={buddy.name} key={buddy.id}>{initials(buddy.name)}</div>
              ))}
            </div>

            <h2 id="commitment-buddy-title">{buddyLabel}</h2>
            {buddyGroup.buddies.length === 1 && primaryBuddy.email ? (
              <a className="commitment-buddy-popup-email" href={`mailto:${encodeURIComponent(primaryBuddy.email)}`}>
                <Mail size={14} aria-hidden="true" />
                {primaryBuddy.email}
              </a>
            ) : buddyGroup.buddies.length > 1 ? (
              <p className="commitment-buddy-popup-email-note">You can see each other&apos;s Commitment Score on My Actions.</p>
            ) : null}
          </div>

          <div className="commitment-buddy-popup-content">
            <div className="commitment-buddy-popup-hello">
              <div className="commitment-buddy-popup-hello-icon" aria-hidden="true"><MessageCircleHeart size={18} /></div>
              <div>
                <h3>Start with a hello</h3>
                <p>Say hi to {helloNames} and agree on a quick catch-up later in the journey.</p>
              </div>
            </div>

            <div className="commitment-buddy-popup-support">
              <div className="commitment-buddy-popup-support-title">
                <UsersRound size={16} aria-hidden="true" />
                <h3>How you&apos;ll support each other</h3>
              </div>
              <p>{buddyGroup.buddies.length === 1
                ? "You'll both see each other's Commitment Score."
                : "You'll all see each other's Commitment Score."}</p>

              <div className="commitment-buddy-popup-states">
                <div className="commitment-buddy-popup-state is-steady">
                  <div className="commitment-buddy-popup-state-heading"><CircleCheckBig size={15} aria-hidden="true" /> Stays at 100%</div>
                  <p>Congratulate them.</p>
                </div>
                <div className="commitment-buddy-popup-state is-drop">
                  <div className="commitment-buddy-popup-state-heading"><HeartHandshake size={15} aria-hidden="true" /> Score drops</div>
                  <p>Check in and offer support.</p>
                </div>
              </div>
            </div>

            <button type="button" className="commitment-buddy-popup-got-it" onClick={dismissBuddyReveal}>Got it</button>
          </div>
        </section>
      </div>;
    })(), document.body)}

    {typeof document !== "undefined" && contactBuddy && createPortal((() => {
      const state = buddyCardState(contactBuddy);
      const contact = buddyContactCopy(contactBuddy, state);
      const mailtoHref = contactBuddy.email
        ? `mailto:${encodeURIComponent(contactBuddy.email)}?subject=${encodeURIComponent(contact.title)}&body=${encodeURIComponent(contact.message)}`
        : undefined;
      return <div className="commitment-buddy-contact-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setContactBuddy(null); }}>
        <section className="commitment-buddy-contact-modal" role="dialog" aria-modal="true" aria-labelledby="buddy-contact-title">
          <div className="commitment-buddy-contact-top">
            <div>
              <h2 id="buddy-contact-title">{contact.title}</h2>
              <p className="commitment-buddy-contact-intro">Copy the email and draft below, then send it using your usual email or messaging app.</p>
            </div>
            <button type="button" className="commitment-buddy-contact-close" onClick={() => setContactBuddy(null)} aria-label="Close"><X size={17} strokeWidth={2.5} /></button>
          </div>

          <div className="commitment-buddy-contact-field-label">
            <span>Email</span>
            {mailtoHref && <a href={mailtoHref}>Open in email app</a>}
          </div>
          <div className="commitment-buddy-contact-selectable" tabIndex={0}>{contactBuddy.email ?? "No email on file"}</div>

          <label className="commitment-buddy-contact-field-label" htmlFor="buddy-draft-message">Suggested message</label>
          <textarea id="buddy-draft-message" className="commitment-buddy-contact-selectable" readOnly value={contact.message} />

          <button type="button" className="commitment-buddy-contact-ok" onClick={() => setContactBuddy(null)}>OK</button>
        </section>
      </div>;
    })(), document.body)}

    {typeof document !== "undefined" && completingId && createPortal(<div className="actions-checkin-overlay"><div className="actions-checkin-modal"><button onClick={() => { setCompletingId(null); setCompleteError(null); }}><X size={18} /></button><span className="participant-eyebrow">Action check-in</span><h3>How did this action go?</h3><p>Add a short reflection. It helps you notice what worked and what to adjust.</p><textarea value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="What happened when you tried it?" />{completeError && <p className="actions-checkin-error" role="alert" style={{ color: "var(--color-danger, #ed4551)", fontSize: "var(--text-sm)" }}>{completeError}</p>}<div><button className="journey-primary-button" disabled={busy} onClick={() => finish(true)}><CheckCircle2 size={16} strokeWidth={2.5} />{busy ? "Saving…" : "Complete action"}</button></div></div></div>, document.body)}

    {typeof document !== "undefined" && celebration && createPortal(
      <ConfettiCelebration
        actionTitle={celebration.title}
        pointsDelta={celebration.pointsDelta}
        completedLate={celebration.completedLate}
        onContinue={continueFromCelebration}
        onClose={closeCelebration}
      />,
      document.body,
    )}
  </div>;
}
