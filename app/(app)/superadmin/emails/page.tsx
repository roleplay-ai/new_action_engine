import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUsersWithProfiles } from "@/app/actions/superadmin";
import AutoLoginTestingPanel from "../auto-login-testing-panel";
import AutoLoginEmailPanel from "../auto-login-email-panel";
import EmailSchedulerPanel from "../email-scheduler-panel";
import { KeyRound, MailCheck, ShieldCheck } from "lucide-react";

export default async function SuperadminEmailsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const superadminEmail = (
    process.env.SUPERADMIN_EMAIL || "admin@actionengine"
  ).toLowerCase();
  const isSuperadminEmail = user.email?.toLowerCase() === superadminEmail;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "superadmin" && !isSuperadminEmail) redirect("/");

  const usersResult = await getUsersWithProfiles();
  const users = Array.isArray(usersResult) ? usersResult : [];
  const usersError = !Array.isArray(usersResult) ? usersResult.error : null;

  return (
    <div className="superadmin-page">
      <div className="superadmin-page-heading"><div><span>Communication operations</span><h1>Email delivery</h1><p>Send secure access links, test login journeys, and manage scheduled campaigns.</p></div></div>

      <div className="superadmin-stat-grid">
        <div className="superadmin-stat"><span><MailCheck size={17} /></span><div><small>Recipients</small><strong>{users.filter((item) => item.role !== "superadmin").length}</strong><p>Accounts eligible for delivery</p></div></div>
        <div className="superadmin-stat"><span><KeyRound size={17} /></span><div><small>Login ready</small><strong>{users.filter((item) => !!item.persistent_login_key).length}</strong><p>Persistent keys configured</p></div></div>
        <div className="superadmin-stat"><span><ShieldCheck size={17} /></span><div><small>Without keys</small><strong>{users.filter((item) => item.role !== "superadmin" && !item.persistent_login_key).length}</strong><p>Need credential preparation</p></div></div>
      </div>

      {usersError && (
        <div className="superadmin-alert warning">
          <strong>{usersError}</strong><span>Ensure the service-role configuration is available to list recipients.</span>
        </div>
      )}

      <AutoLoginEmailPanel users={users} />

      <AutoLoginTestingPanel users={users} />

      <EmailSchedulerPanel users={users} />
    </div>
  );
}

