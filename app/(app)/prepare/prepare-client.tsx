"use client";

import { useCallback, useEffect, useState } from "react";
import { getMyCohort } from "@/app/actions/cohorts";
import { listCohortContent } from "@/app/actions/prepare-content";
import { getMyPrepareProgress, markContentViewed } from "@/app/actions/prepare-progress";
import CohortRoster from "@/components/prepare/CohortRoster";
import PrepProgressTracker from "@/components/prepare/PrepProgressTracker";
import VideoCard from "@/components/prepare/VideoCard";
import PrereadCard from "@/components/prepare/PrereadCard";
import QuizCard from "@/components/prepare/QuizCard";
import type { CohortMember, PrepareContentItem, UserPrepareProgress } from "@/lib/types";

export default function PrepareClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cohort, setCohort] = useState<{ id: string; name: string } | null>(null);
  const [roster, setRoster] = useState<CohortMember[]>([]);
  const [items, setItems] = useState<PrepareContentItem[]>([]);
  const [progress, setProgress] = useState<Record<string, UserPrepareProgress>>({});
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    const { cohort: myCohort, roster: myRoster, error: cohortErr } = await getMyCohort();
    if (cohortErr) {
      setError(cohortErr);
      setLoading(false);
      return;
    }
    if (!myCohort) {
      setCohort(null);
      setLoading(false);
      return;
    }
    setCohort({ id: myCohort.id, name: myCohort.name });
    setRoster(myRoster ?? []);

    const [{ items: contentItems, error: contentErr }, progressRes] = await Promise.all([
      listCohortContent(myCohort.id),
      getMyPrepareProgress(myCohort.id),
    ]);
    if (contentErr) {
      setError(contentErr);
      setLoading(false);
      return;
    }
    setItems(contentItems ?? []);
    const progressMap: Record<string, UserPrepareProgress> = {};
    for (const p of progressRes.progress ?? []) progressMap[p.contentItemId] = p;
    setProgress(progressMap);
    setCompletedCount(progressRes.completedCount ?? 0);
    setTotalCount(progressRes.totalCount ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleComplete(contentItemId: string) {
    const { error } = await markContentViewed(contentItemId);
    if (!error) await load();
  }

  if (loading) {
    return (
      <div className="w-full space-y-10">
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full space-y-10">
        <p className="text-sm font-bold" style={{ color: "#ED4551" }}>{error}</p>
      </div>
    );
  }

  if (!cohort) {
    return (
      <div className="animate-in fade-in duration-700 w-full space-y-10">
        <h1 className="text-4xl font-bold" style={{ color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>
          Prepare
        </h1>
        <div className="card card--flat text-center">
          <div className="icon-badge">🎓</div>
          <h3 className="card__title">You haven&apos;t been added to a cohort yet</h3>
          <p className="card__subtitle mb-0">
            Contact your admin to get added to a cohort — you&apos;ll see your prep content here once you are.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-700 w-full space-y-10">
      <div>
        <h1 className="text-4xl font-bold" style={{ color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>
          {cohort.name}
        </h1>
        <p className="text-sm font-medium mt-3" style={{ color: "var(--color-text-secondary)" }}>
          Complete these steps to arrive ready.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <PrepProgressTracker completedCount={completedCount} totalCount={totalCount} />
        <CohortRoster roster={roster} />
      </div>

      {items.length === 0 ? (
        <div className="card card--flat text-center">
          <p className="card__subtitle mb-0">No prep content assigned yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {items.map((item) => {
            const p = progress[item.id];
            const completed = p?.status === "completed";
            if (item.type === "video") {
              return <VideoCard key={item.id} item={item} completed={completed} onComplete={handleComplete} />;
            }
            if (item.type === "preread") {
              return <PrereadCard key={item.id} item={item} completed={completed} onComplete={handleComplete} />;
            }
            return (
              <QuizCard
                key={item.id}
                item={item}
                completed={completed}
                lastScore={p?.lastScore}
                lastTotalQuestions={p?.lastTotalQuestions}
                onComplete={handleComplete}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
