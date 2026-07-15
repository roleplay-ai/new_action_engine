import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ActionPlanClient from "./action-plan-client";

export default async function ActionPlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <ActionPlanClient />;
}
