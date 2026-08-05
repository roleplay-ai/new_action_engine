"use client";

import React from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { GenerationJobStatus } from "@/lib/store";

/** Small "N/M actions generated" line with a progress bar, shown while a background plan-generation job is running. */
const GenerationStatus: React.FC<{ job: GenerationJobStatus }> = ({ job }) => {
  const pct = job.totalNeeded > 0 ? Math.min(100, Math.round((job.totalGenerated / job.totalNeeded) * 100)) : 0;

  return (
    <div className="generation-progress">
      <div className="generation-progress-head">
        <span className="generation-progress-icon"><Loader2 /><Sparkles /></span>
        <span>
          <strong>AI is building your plan</strong>
          <small>{job.totalGenerated > 0 ? "Your first actions are ready to preview below." : "Reading your notes and creating practical actions…"}</small>
        </span>
        <b>{pct}%</b>
      </div>
      <div
        className="generation-progress-track"
        role="progressbar"
        aria-label="Action generation progress"
        aria-valuemin={0}
        aria-valuemax={job.totalNeeded}
        aria-valuenow={job.totalGenerated}
      >
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="generation-progress-count"><span>{job.totalGenerated} ready</span><span>{job.totalNeeded} total actions</span></div>
    </div>
  );
};

export default GenerationStatus;
