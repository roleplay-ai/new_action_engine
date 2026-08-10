import { UserRound } from "lucide-react";
import { getMyCohorts } from "@/app/actions/cohorts";
import { TrainerCohortSwitcher } from "@/components/trainer/TrainerCohortSwitcher";
import CohortChat from "@/components/journey/CohortChat";

export default async function TrainerConversationPage() {
  const { cohorts, error } = await getMyCohorts();
  const selected = (cohorts ?? []).find((cohort) => cohort.isSelected);

  return (
    <div className="trainer-page">
      <header className="trainer-page-head">
        <div><h1>Conversation</h1><p>{selected ? `Talking with ${selected.name}.` : "Your batch conversation."}</p></div>
        {cohorts && cohorts.length > 0 && <TrainerCohortSwitcher cohorts={cohorts} />}
      </header>

      {error && <div className="trainer-alert">{error}</div>}

      {!selected ? (
        <div className="trainer-empty">
          <UserRound size={26} />
          <strong>No batch assigned yet</strong>
          <p>Ask a superadmin to assign you as the trainer for a cohort in Cohort Management.</p>
        </div>
      ) : (
        <div className="trainer-chat-shell">
          <CohortChat cohortId={selected.id} />
        </div>
      )}
    </div>
  );
}
