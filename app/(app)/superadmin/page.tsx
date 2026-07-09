import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CompaniesList from "./companies-list";
import CreateCompanyForm from "./create-company-form";

export default async function SuperadminCompaniesPage() {
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

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, slug, created_at")
    .order("name");

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-black uppercase italic tracking-tight">
          Companies
        </h1>
        <CreateCompanyForm />
      </div>

      <div className="bg-white border-4 border-black rounded-[24px] overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        {companies && companies.length > 0 ? (
          <CompaniesList companies={companies} />
        ) : (
          <div className="p-12 text-center text-slate-500">
            <p className="font-bold uppercase tracking-wider">No companies yet</p>
            <p className="text-sm mt-2">Create your first company above</p>
          </div>
        )}
      </div>
    </div>
  );
}
