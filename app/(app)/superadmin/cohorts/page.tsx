import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminPageClient } from "../../admin/admin-page-client";

export default async function SuperadminCohortsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const superadminEmail = (process.env.SUPERADMIN_EMAIL || "admin@actionengine").toLowerCase();
  const isSuperadminEmail = user.email?.toLowerCase() === superadminEmail;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "superadmin" && !isSuperadminEmail) redirect("/");

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, slug")
    .order("name");

  return (
    <AdminPageClient
      companies={companies ?? []}
      role="superadmin"
      companyId={profile?.company_id ?? null}
      view="cohort-management"
    />
  );
}
