import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NotesClient from "./notes-client";

export default async function NotesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <NotesClient />;
}
