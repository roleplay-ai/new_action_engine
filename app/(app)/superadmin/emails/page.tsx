import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUsersWithProfiles } from "@/app/actions/superadmin";
import AutoLoginTestingPanel from "../auto-login-testing-panel";
import AutoLoginEmailPanel from "../auto-login-email-panel";
import EmailSchedulerPanel from "../email-scheduler-panel";
import ActionReminderLogsPanel from "../action-reminder-logs-panel";

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
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-black uppercase italic tracking-tight">
          Emails
        </h1>
      </div>

      {usersError && (
        <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-xl">
          <p className="text-sm font-bold text-amber-800">{usersError}</p>
          <p className="text-xs mt-1 text-amber-600">
            Ensure SUPABASE_SERVICE_ROLE_KEY is set in .env.local to list users.
          </p>
        </div>
      )}

      <AutoLoginEmailPanel users={users} />

      <AutoLoginTestingPanel users={users} />

      <EmailSchedulerPanel users={users} />

      <ActionReminderLogsPanel />
    </div>
  );
}

