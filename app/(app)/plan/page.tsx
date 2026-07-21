import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PlanClient from "./plan-client";
import { getMyCohort } from "@/app/actions/cohorts";
import { getMySessionNotes } from "@/app/actions/session-notes";

export default async function PlanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { cohort } = await getMyCohort();
  const notes = await getMySessionNotes(cohort?.id);
  return <PlanClient initialTrainingText={notes.body} />;
}
