"use client";

import React from "react";
import type { GenerationJobStatus } from "@/lib/store";

/** Small "N/M actions generated" line with a progress bar, shown while a background plan-generation job is running. */
const GenerationStatus: React.FC<{ job: GenerationJobStatus }> = ({ job }) => {
  const pct = job.totalNeeded > 0 ? Math.min(100, Math.round((job.totalGenerated / job.totalNeeded) * 100)) : 0;

  return (
    <div>
      <p className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>
        Generating your action plan… {job.totalGenerated}/{job.totalNeeded} actions
      </p>
      <div
        style={{
          width: "100%",
          height: 6,
          borderRadius: 999,
          background: "var(--color-border)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 999,
            background: "var(--bright-amber)",
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
};

export default GenerationStatus;
