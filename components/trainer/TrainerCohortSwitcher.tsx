"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { selectMyCohort } from "@/app/actions/cohorts";
import type { CohortOption } from "@/lib/types";

/** Lets a trainer running more than one cohort switch which one every /trainer
 * page is scoped to. A single trainer can run several cohorts over time
 * (see 049_trainers.sql) — getMyCohorts already resolves that list for any role. */
export function TrainerCohortSwitcher({ cohorts }: { cohorts: CohortOption[] }) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const selected = cohorts.find((cohort) => cohort.isSelected);

  if (cohorts.length <= 1) {
    return selected ? (
      <div className="trainer-cohort-current">
        <strong>{selected.name}</strong>
        {selected.companyName && <span>{selected.companyName}</span>}
      </div>
    ) : null;
  }

  async function handleChange(cohortId: string) {
    if (!cohortId || switching) return;
    setSwitching(true);
    await selectMyCohort(cohortId);
    router.refresh();
    setSwitching(false);
  }

  return (
    <label className="trainer-cohort-switcher">
      <span>Batch</span>
      <select value={selected?.id ?? ""} onChange={(event) => void handleChange(event.target.value)} disabled={switching} aria-label="Switch batch">
        {cohorts.map((cohort) => (
          <option key={cohort.id} value={cohort.id}>{cohort.name}</option>
        ))}
      </select>
    </label>
  );
}
