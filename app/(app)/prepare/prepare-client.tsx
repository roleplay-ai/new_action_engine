"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { useEngine } from "@/lib/store";
import { getMyCohort } from "@/app/actions/cohorts";
import { listCohortContent } from "@/app/actions/prepare-content";
import { getMyPrepareProgress, markContentViewed } from "@/app/actions/prepare-progress";
import CohortRoster from "@/components/prepare/CohortRoster";
import PrepProgressTracker, { type PrepChecklistItem } from "@/components/prepare/PrepProgressTracker";
import VideoCard from "@/components/prepare/VideoCard";
import PrereadCard from "@/components/prepare/PrereadCard";
import QuizCard from "@/components/prepare/QuizCard";
import type { Cohort, CohortMember, PrepareContentItem, UserPrepareProgress } from "@/lib/types";
import { estimateMinutes } from "@/lib/prepare-estimate";

function formatSessionDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase();
}

const VIDEO_ACCENTS = ["#FADCC0", "#D7ECFC", "#C9F0DC", "#E0D6F5"];

export default function PrepareClient() {
  const { profile } = useEngine();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cohort, setCohort] = useState<Cohort | null>(null);
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
    setCohort(myCohort);
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

  const videoItems = items.filter((i) => i.type === "video");
  const otherItems = items.filter((i) => i.type !== "video");
  const firstName = profile.name.split(" ")[0];
  const videoMinutesTotal = videoItems.reduce((sum, i) => sum + (estimateMinutes(i) ?? 0), 0);

  const checklist: PrepChecklistItem[] = items.map((item) => ({
    item,
    status: progress[item.id]?.status ?? "not_started",
  }));

  return (
    <div className="animate-in fade-in duration-700 w-full space-y-10">
      {/* ── Header ── */}
      <div
        className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6"
        style={{
          background: "var(--color-bg-dark)",
          borderRadius: "var(--radius-xl)",
          padding: "var(--space-8)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute", top: -60, right: -60, width: 220, height: 220, borderRadius: "50%",
            border: "40px solid rgba(255,255,255,0.04)",
          }}
        />
        <div style={{ position: "relative", zIndex: 1 }}>
          {cohort.description && (
            <p
              className="text-xs font-black uppercase tracking-wider mb-2"
              style={{ color: "var(--bright-amber)" }}
            >
              {cohort.description}
            </p>
          )}
          <h1 className="text-4xl font-bold" style={{ color: "#fff", letterSpacing: "-0.01em" }}>
            Welcome, {firstName}.
          </h1>
          <p className="text-sm font-medium mt-3 max-w-lg" style={{ color: "rgba(255,255,255,0.65)" }}>
            Your learning journey begins before the session. Complete these steps to arrive ready.
          </p>
        </div>

        {cohort.startDate && (
          <div
            className="flex items-center gap-4 shrink-0"
            style={{
              position: "relative", zIndex: 1,
              background: "var(--bright-amber)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-5) var(--space-6)",
            }}
          >
            <Calendar size={20} style={{ color: "var(--color-text-primary)" }} strokeWidth={2.5} />
            <div>
              <p className="text-xs font-black uppercase tracking-wider" style={{ color: "var(--color-text-primary)", opacity: 0.7 }}>
                Live session
              </p>
              <p className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>
                {formatSessionDate(cohort.startDate)}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start">
        {/* ── Main column ── */}
        <div className="space-y-10 min-w-0">
          {items.length === 0 ? (
            <div className="card card--flat text-center">
              <p className="card__subtitle mb-0">No prep content assigned yet.</p>
            </div>
          ) : (
            <>
              {videoItems.length > 0 && (
                <section>
                  <span className="tag tag--blue mb-2 inline-block">Start here</span>
                  <h2
                    style={{
                      fontSize: "var(--text-2xl)", fontWeight: "var(--weight-bold)",
                      color: "var(--color-text-primary)", letterSpacing: "-0.02em", marginBottom: "4px",
                    }}
                  >
                    A message from your leaders
                  </h2>
                  {videoMinutesTotal > 0 && (
                    <p className="text-sm mb-4" style={{ color: "var(--color-text-muted)" }}>{videoMinutesTotal} min total</p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {videoItems.map((item, i) => (
                      <div key={item.id} id={`prepare-item-${item.id}`}>
                        <VideoCard
                          item={item}
                          completed={progress[item.id]?.status === "completed"}
                          onComplete={handleComplete}
                          accentColor={VIDEO_ACCENTS[i % VIDEO_ACCENTS.length]}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {otherItems.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {otherItems.map((item) => {
                    const p = progress[item.id];
                    const completed = p?.status === "completed";
                    return (
                      <div key={item.id} id={`prepare-item-${item.id}`}>
                        {item.type === "preread" ? (
                          <PrereadCard item={item} completed={completed} onComplete={handleComplete} />
                        ) : (
                          <QuizCard
                            item={item}
                            completed={completed}
                            lastScore={p?.lastScore}
                            lastTotalQuestions={p?.lastTotalQuestions}
                            onComplete={handleComplete}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {roster.length > 0 && <CohortRoster roster={roster} />}
            </>
          )}
        </div>

        {/* ── Sidebar ── */}
        {items.length > 0 && (
          <PrepProgressTracker
            checklist={checklist}
            completedCount={completedCount}
            totalCount={totalCount}
            deadlineLabel={cohort.startDate ? `Complete before your session on ${formatSessionDate(cohort.startDate)}` : null}
          />
        )}
      </div>
    </div>
  );
}
