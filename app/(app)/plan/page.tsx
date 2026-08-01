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
      <p>Keep your thinking and your personalised workplace actions together in one private workspace.</p>
    </div>
    <nav className="unified-plan-flow" aria-label="My Plan sections">
      <a href="#notes"><span>1</span><strong>Reflect in notes</strong><small>Capture what mattered</small></a>
      <i aria-hidden="true" />
      <a href="#action-plan"><span>2</span><strong>Build your actions</strong><small>Generate, review and activate</small></a>
    </nav>
    <UnifiedPlanClient initialTrainingText={notes.body} />
  </div>;
}
