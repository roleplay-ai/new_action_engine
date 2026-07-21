import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrepareClient from "../prepare/prepare-client";

export default async function JourneyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <PrepareClient />;
}
