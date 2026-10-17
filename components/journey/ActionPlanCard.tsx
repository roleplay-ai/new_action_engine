"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, FileText, Loader2, Sparkles } from "lucide-react";
import { useEngine } from "@/lib/store";
import { getMyPlanSettings } from "@/app/actions/ai-actions";

function formatReminder(iso: string | null) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));
}

/**
 * The action-plan add-on on the journey dashboard. It follows the plan through
 * its stages: create it, activate it, then this week's actions and progress.
 * Plan creation still lives on /plan until it moves into My Actions.
 */
export default function ActionPlanCard({ locked }: { locked?: boolean }) {
  const { cohort, cohorts, personalPlanState, generationJob, userActions, allActions } = useEngine();
  const [nextReminder, setNextReminder] = useState<string | null>(null);
  const isCurrentBatch = cohorts.find((option) => option.id === cohort?.id)?.isCurrent !== false;
  const planIsLive = personalPlanState === "active" || personalPlanState === "archived";

  useEffect(() => {
    if (!cohort?.id || personalPlanState !== "active") {
      setNextReminder(null);
      return;
    }
    let cancelled = false;
    void getMyPlanSettings(cohort.id).then(({ settings }) => {
      if (!cancelled) setNextReminder(settings?.nextDeliveryAt ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [cohort?.id, personalPlanState]);

  const progress = useMemo(() => {
    const planActions = allActions.filter((action) => action.isPersonal);
    const titles = new Map(planActions.map((action) => [action.id, action.title]));
    const current = userActions
      .filter((item) => item.status === "scheduled" && titles.has(item.actionId))
      .map((item) => ({ id: item.id, title: titles.get(item.actionId)! }));
    const done = userActions.filter((item) => item.status === "success" && titles.has(item.actionId)).length;
    return { current, done, total: planActions.length };
  }, [allActions, userActions]);

  if (locked || !cohort) return null;
  // An earlier batch with no plan has nothing to show or start.
  if (!isCurrentBatch && !planIsLive) return null;

  if (!planIsLive) {
    const generating = generationJob?.status === "generating";
    const drafted = personalPlanState === "draft";
    return (
      <section className="rcpl-plan-card">
        <span className="rcpl-plan-card-icon" aria-hidden="true">
          {generating ? <Loader2 size={24} className="animate-spin" /> : drafted ? <FileText size={24} /> : <Sparkles size={24} />}
        </span>
        <div className="rcpl-plan-card-copy">
          <small>{generating ? "Your action plan · in progress" : drafted ? "Your action plan · almost there" : "New · your action plan"}</small>
          <h3>{generating
            ? "Your actions are being created"
            : drafted
              ? "Your plan is saved. Activate it to get your actions."
              : "Turn this programme into practice at work"}</h3>
          <p>{generating
            ? `${generationJob.totalGenerated} of ${generationJob.totalNeeded} actions ready so far.`
            : drafted
              ? "Review your actions and switch them on."
              : "Answer one question about the skill you want to build. We'll turn it into small actions for your work week."}</p>
        </div>
        <Link href="/plan" className="journey-primary-button">
          {generating ? "See progress" : drafted ? "Activate my plan" : "Create my plan"} <ArrowRight size={14} />
        </Link>
      </section>
    );
  }

  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const reminder = formatReminder(nextReminder);
  return (
    <section className="rcpl-plan-card rcpl-plan-card--live">
      <div className="rcpl-plan-card-copy">
        <small>{personalPlanState === "archived" ? "Your earlier action plan" : "Your action plan · this week"}</small>
        {progress.current.length ? (
          <ul className="rcpl-plan-card-actions">
            {progress.current.map((item) => (
              <li key={item.id}>
                <Link href="/actions">
                  <span className="rcpl-plan-card-check" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
                  <span>{item.title}</span>
                  <em>Mark done <ArrowRight size={12} /></em>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <h3>{progress.done === progress.total && progress.total > 0
            ? "Every action in your plan is done. Brilliant work!"
            : "Nothing due right now. Your next actions are on their way."}</h3>
        )}
      </div>
      <div className="rcpl-plan-card-side">
        <div className="rcpl-plan-card-ring" style={{ "--p": percent } as React.CSSProperties} role="img" aria-label={`${progress.done} of ${progress.total} actions done`}>
          <div><strong>{progress.done}/{progress.total}</strong><small>done</small></div>
        </div>
        <div className="rcpl-plan-card-meta">
          {reminder && <><span>Next reminder</span><strong>{reminder}</strong></>}
          <Link href="/actions" className="journey-primary-button">My actions <ArrowRight size={14} /></Link>
        </div>
      </div>
    </section>
  );
}
