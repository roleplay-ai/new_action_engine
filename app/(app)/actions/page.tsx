import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ActionsClient from "./actions-client";

export default async function ActionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <ActionsClient />;
}
