import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUsersWithProfiles } from "@/app/actions/superadmin";
import AutoLoginTestingPanel from "../auto-login-testing-panel";
import AutoLoginEmailPanel from "../auto-login-email-panel";
import EmailSchedulerPanel from "../email-scheduler-panel";
import ActionReminderLogsPanel from "../action-reminder-logs-panel";
import ActionReminderQueuePanel from "../action-reminder-queue-panel";
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
      <div className="superadmin-page-heading"><div><span>Communication operations</span><h1>Emails &amp; reminders</h1><p>Review upcoming participant reminders, send them immediately, and manage secure access and scheduled campaigns.</p></div></div>

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

      <div className="superadmin-section-heading standalone">
        <div>
          <h2>Participant reminder emails</h2>
          <p>See every user&apos;s next reminder and use bulk send whenever needed.</p>
        </div>
        <span>11:30 AM IST</span>
      </div>

      <ActionReminderQueuePanel />

      <div className="superadmin-section-heading standalone">
        <div>
          <h2>Welcome &amp; access emails</h2>
          <p>Send branded login emails and verify secure one-click access.</p>
        </div>
      </div>

      <AutoLoginEmailPanel users={users} />

      <AutoLoginTestingPanel users={users} />

      <div className="superadmin-section-heading standalone">
        <div>
          <h2>Campaign scheduling</h2>
          <p>Manage reusable email schedules and review delivery history.</p>
        </div>
      </div>

      <EmailSchedulerPanel users={users} />
      <ActionReminderLogsPanel />
    </div>
  );
}

