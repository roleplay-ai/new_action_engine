import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminPageClient } from "../../admin-page-client";

export default async function ActionManagementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin" && profile?.role !== "superadmin") {
    redirect("/");
  }

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, slug")
    .order("name");

  return (
    <AdminPageClient
      companies={companies ?? []}
      role={profile?.role ?? "user"}
      companyId={profile?.company_id ?? null}
      view="action-management"
    />
  );
}
