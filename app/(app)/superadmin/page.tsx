import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CompaniesList from "./companies-list";
import CreateCompanyForm from "./create-company-form";
import { Building2, CalendarDays, Link2 } from "lucide-react";

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
  const companyRows = companies ?? [];
  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);
  const recentlyCreated = companyRows.filter((company) => new Date(company.created_at) >= thisMonth).length;

  return (
    <div className="superadmin-page">
      <div className="superadmin-page-heading">
        <div><span>Organisation management</span><h1>Companies</h1><p>Create and maintain the organisations using Nudgeable.</p></div>
        <CreateCompanyForm />
      </div>

      <div className="superadmin-stat-grid">
        <div className="superadmin-stat"><span><Building2 size={17} /></span><div><small>Total companies</small><strong>{companyRows.length}</strong><p>Organisations in the workspace</p></div></div>
        <div className="superadmin-stat"><span><Link2 size={17} /></span><div><small>Configured slugs</small><strong>{companyRows.filter((company) => !!company.slug).length}</strong><p>Ready for branded access</p></div></div>
        <div className="superadmin-stat"><span><CalendarDays size={17} /></span><div><small>Added this month</small><strong>{recentlyCreated}</strong><p>New organisation records</p></div></div>
      </div>

      <section className="superadmin-surface">
        <div className="superadmin-section-heading"><div><h2>Company directory</h2><p>Names, workspace slugs, and account creation dates.</p></div><span>{companyRows.length} total</span></div>
        {companyRows.length > 0 ? (
          <CompaniesList companies={companyRows} />
        ) : (
          <div className="superadmin-empty">
            <Building2 size={26} /><strong>No companies yet</strong><p>Create the first organisation to begin assigning users and cohorts.</p>
          </div>
        )}
      </section>
    </div>
  );
}
