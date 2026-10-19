import { redirect } from "next/navigation";

/**
 * Plans are written and activated on My Actions now (Phase 3 of
 * docs/PARTICIPANT_JOURNEY_REDESIGN_PLAN.md). Kept so old links and emails still land somewhere useful.
 */
export default function PlanPage() {
  redirect("/actions");
}
