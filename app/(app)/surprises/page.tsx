import SurprisesClient from "./surprises-client";
import { getMyCohort } from "@/app/actions/cohorts";
import { getMySurpriseShelf } from "@/app/actions/surprise-boxes";
import { cohortLockInfo } from "@/lib/cohort-lock";
import { CohortLockedNotice } from "@/components/CohortLockedNotice";

export default async function SurprisesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { cohort } = await getMyCohort({ includeRoster: false });
  const lock = cohortLockInfo(cohort);
  if (lock.locked) {
    return (
      <CohortLockedNotice
        title="Your surprise boxes aren't open yet"
        body="Your trainer or admin hasn't opened up action planning for you yet."
        daysToGo={lock.daysToGo}
      />
    );
  }

  const [{ shelf }, params] = await Promise.all([getMySurpriseShelf(cohort?.id), searchParams]);
  // /surprises?reveal=<unlockId,…> — set after completing an action — opens those boxes.
  const revealUnlockIds = (Array.isArray(params.reveal) ? params.reveal.join(",") : params.reveal ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  return <SurprisesClient key={cohort?.id ?? "no-cohort"} shelf={shelf} revealUnlockIds={revealUnlockIds} />;
}
