"use client";

import { BellRing, ListChecks, NotebookPen, Sparkles } from "lucide-react";
import type { GenerationJobStatus } from "@/lib/store";

const STORY_STAGES = [
  { title: "Read your answers", icon: NotebookPen },
  { title: "Find the patterns", icon: Sparkles },
  { title: "Create small actions", icon: ListChecks },
  { title: "Schedule your nudges", icon: BellRing },
];

export default function ActionGenerationStory({ job }: { job: GenerationJobStatus | null }) {
  const total = job?.totalNeeded ?? 0;
  const ready = job?.totalGenerated ?? 0;
  const percentage = total > 0 ? Math.min(100, Math.round((ready / total) * 100)) : 0;
  const hasMeasuredProgress = total > 0 && percentage > 0;

  return <div className="action-generation-story-overlay">
    <section
      className="action-generation-story-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-generation-story-title"
      aria-describedby="action-generation-story-description"
    >
      <header className="action-generation-story-head">
        <div className="action-generation-story-mark" aria-hidden="true">
          <Sparkles size={25} />
        </div>
        <div>
          <span>Building my personal plan</span>
          <h2 id="action-generation-story-title">Generating your actions</h2>
          <p id="action-generation-story-description">AI is turning your learning into practical steps you can use at work.</p>
        </div>
      </header>

      <div className="action-generation-story-stages" aria-label="How Nudgeable creates my action plan">
        {STORY_STAGES.map(({ title, icon: Icon }, index) => <article key={title}>
          <div aria-hidden="true"><Icon size={22} /><span>{index + 1}</span></div>
          <strong>{title}</strong>
        </article>)}
      </div>

      <div className="action-generation-story-progress" aria-live="polite">
        <div><strong className="action-generation-story-hold">Don&apos;t touch anywhere — hold on</strong>{hasMeasuredProgress && <span>{percentage}%</span>}</div>
        <div
          className={`action-generation-story-track${hasMeasuredProgress ? " measured" : ""}`}
          role="progressbar"
          aria-label="Action generation progress"
          aria-valuemin={0}
          aria-valuemax={total || undefined}
          aria-valuenow={total ? ready : undefined}
        >
          <span style={hasMeasuredProgress ? { width: `${percentage}%` } : undefined} />
        </div>
      </div>
    </section>
  </div>;
}
