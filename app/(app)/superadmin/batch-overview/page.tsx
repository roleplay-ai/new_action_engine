import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BatchOverviewClient from "./batch-overview-client";

export default async function SuperadminBatchOverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const superadminEmail = (process.env.SUPERADMIN_EMAIL || "admin@actionengine").toLowerCase();
  const isSuperadminEmail = user.email?.toLowerCase() === superadminEmail;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "superadmin" && !isSuperadminEmail) redirect("/");

  return (
    <div className="superadmin-page">
      <div className="superadmin-page-heading">
        <div>
          <h1>Batch overview</h1>
          <p>Pick a company in the top bar to see plan uptake, commitment, email engagement, conversations and announcements for every batch.</p>
        </div>
      </div>
      <BatchOverviewClient />
    </div>
  );
}
