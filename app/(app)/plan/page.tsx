import UnifiedPlanClient from "./unified-plan-client";
import { getMyCohort } from "@/app/actions/cohorts";
import { getMySessionNotes } from "@/app/actions/session-notes";
import { cohortLockInfo } from "@/lib/cohort-lock";
import { CohortLockedNotice } from "@/components/CohortLockedNotice";

export default async function PlanPage() {
  const { cohort } = await getMyCohort({ includeRoster: false });
  const lock = cohortLockInfo(cohort);
  if (lock.locked) {
    return (
      <div className="unified-plan-page">
        <CohortLockedNotice
          title="Your plan isn't open yet"
          body="Your trainer or admin hasn't opened up action planning for you yet."
          daysToGo={lock.daysToGo}
        />
      </div>
    );
  }

  const notes = await getMySessionNotes(cohort?.id);
  return <div className="unified-plan-page">
    <UnifiedPlanClient initialTrainingText={notes.body} />
  </div>;
}
