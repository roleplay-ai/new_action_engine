import { UserRound } from "lucide-react";
import { getMyCohort, getMyCohorts } from "@/app/actions/cohorts";
import { listParticipantTags } from "@/app/actions/participant-tags";
import { TrainerCohortSwitcher } from "@/components/trainer/TrainerCohortSwitcher";
import MembersClient from "./members-client";

export default async function TrainerMembersPage() {
  const [{ cohorts, error }, cohortResult, tagsResult] = await Promise.all([
    getMyCohorts(),
    getMyCohort(),
    listParticipantTags(),
  ]);
  const selected = (cohorts ?? []).find((cohort) => cohort.isSelected);

  return (
    <div className="trainer-page">
      <header className="trainer-page-head">
        <div><h1>Members & tags</h1><p>{selected ? `${cohortResult.roster?.length ?? 0} people in ${selected.name}.` : "Your batch roster."}</p></div>
        {cohorts && cohorts.length > 0 && <TrainerCohortSwitcher cohorts={cohorts} />}
      </header>

      {(error || cohortResult.error || tagsResult.error) && <div className="trainer-alert">{error || cohortResult.error || tagsResult.error}</div>}

      {!selected ? (
        <div className="trainer-empty">
          <UserRound size={26} />
          <strong>No batch assigned yet</strong>
          <p>Ask a superadmin to assign you as the trainer for a cohort in Cohort Management.</p>
        </div>
      ) : (
        <MembersClient cohortId={selected.id} initialRoster={cohortResult.roster ?? []} tags={tagsResult.tags ?? []} />
      )}
    </div>
  );
}
