import ActionsClient from "./actions-client";
import { getMyCohort } from "@/app/actions/cohorts";
import { cohortLockInfo } from "@/lib/cohort-lock";
import { CohortLockedNotice } from "@/components/CohortLockedNotice";

export default async function ActionsPage() {
  const { cohort } = await getMyCohort({ includeRoster: false });
  const lock = cohortLockInfo(cohort);
  if (lock.locked) {
    return (
      <CohortLockedNotice
        title="Actions aren't open yet"
        body="Your trainer or admin hasn't opened up action creation for you yet."
        daysToGo={lock.daysToGo}
      />
    );
  }

  return <ActionsClient />;
}
