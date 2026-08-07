import UnifiedPlanClient from "./unified-plan-client";
import { getMyCohort } from "@/app/actions/cohorts";
import { getMySessionNotes } from "@/app/actions/session-notes";

export default async function PlanPage() {
  const { cohort } = await getMyCohort();
  const notes = await getMySessionNotes(cohort?.id);
  return <div className="unified-plan-page">
    <UnifiedPlanClient initialTrainingText={notes.body} />
  </div>;
}
