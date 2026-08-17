import { UserRound } from "lucide-react";
import { getMyCohorts } from "@/app/actions/cohorts";
import { getCohortNotices } from "@/app/actions/cohort-notices";
import { TrainerCohortSwitcher } from "@/components/trainer/TrainerCohortSwitcher";
import NoticesClient from "@/components/trainer/NoticesClient";

export default async function TrainerNoticesPage() {
  const { cohorts, error } = await getMyCohorts();
  const selected = (cohorts ?? []).find((cohort) => cohort.isSelected);
  const noticesResult = selected ? await getCohortNotices(selected.id) : null;

  return (
    <div className="trainer-page">
      <header className="trainer-page-head">
        <div><h1>Notice board</h1><p>{selected ? `Posting to ${selected.name}.` : "Post dated updates to your batch."}</p></div>
        {cohorts && cohorts.length > 0 && <TrainerCohortSwitcher cohorts={cohorts} />}
      </header>

      {(error || noticesResult?.error) && <div className="trainer-alert">{error || noticesResult?.error}</div>}

      {!selected ? (
        <div className="trainer-empty">
          <UserRound size={26} />
          <strong>No batch assigned yet</strong>
          <p>Ask a superadmin to assign you as the trainer for a batch in Batch Management.</p>
        </div>
      ) : (
        <NoticesClient cohortId={selected.id} initialNotices={noticesResult?.notices ?? []} />
      )}
    </div>
  );
}
