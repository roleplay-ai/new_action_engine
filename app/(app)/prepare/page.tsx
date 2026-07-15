import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrepareClient from "./prepare-client";

export default async function PreparePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <PrepareClient />;
}
