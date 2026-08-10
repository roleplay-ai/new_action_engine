import { UserRound } from "lucide-react";
import { getMyCohorts } from "@/app/actions/cohorts";
import { listFacilitators } from "@/app/actions/facilitators";
import { TrainerCohortSwitcher } from "@/components/trainer/TrainerCohortSwitcher";
import FacilitatorsClient from "./facilitators-client";

export default async function TrainerFacilitatorsPage() {
  const { cohorts, error } = await getMyCohorts();
  const selected = (cohorts ?? []).find((cohort) => cohort.isSelected);
  const facilitatorsResult = selected ? await listFacilitators(selected.id) : null;

  return (
    <div className="trainer-page">
      <header className="trainer-page-head">
        <div><h1>Facilitators</h1><p>{selected ? `Running ${selected.name} with you.` : "Who's running this batch."}</p></div>
        {cohorts && cohorts.length > 0 && <TrainerCohortSwitcher cohorts={cohorts} />}
      </header>

      {(error || facilitatorsResult?.error) && <div className="trainer-alert">{error || facilitatorsResult?.error}</div>}

      {!selected ? (
        <div className="trainer-empty">
          <UserRound size={26} />
          <strong>No batch assigned yet</strong>
          <p>Ask a superadmin to assign you as the trainer for a cohort in Cohort Management.</p>
        </div>
      ) : (
        <FacilitatorsClient cohortId={selected.id} initialFacilitators={facilitatorsResult?.facilitators ?? []} />
      )}
    </div>
  );
}
