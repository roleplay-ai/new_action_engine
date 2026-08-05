import UnifiedPlanClient from "./unified-plan-client";
import { getMyCohort } from "@/app/actions/cohorts";
import { getMySessionNotes } from "@/app/actions/session-notes";

export default async function PlanPage() {
  const { cohort } = await getMyCohort();
  const notes = await getMySessionNotes(cohort?.id);
  return <div className="unified-plan-page">
    <div className="participant-page-heading">
      <span className="participant-eyebrow">Private workspace</span>
      <h1>My Plan</h1>
      <p>Write this for yourself. AI can use your notes, but the final plan stays yours.</p>
    </div>
    <UnifiedPlanClient initialTrainingText={notes.body} />
  </div>;
}
