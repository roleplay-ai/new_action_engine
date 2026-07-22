import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUsersWithProfiles } from "@/app/actions/superadmin";
import UsersList from "../users-list";
import CreateUserForm from "../create-user-form";
import { Building2, ShieldCheck, UserRound, Users } from "lucide-react";

export default async function SuperadminUsersPage() {
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

  const usersResult = await getUsersWithProfiles();
  const users = Array.isArray(usersResult) ? usersResult : [];
  const usersError = !Array.isArray(usersResult) ? usersResult.error : null;

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name")
    .order("name");

  return (
    <div className="superadmin-page">
      <div className="superadmin-page-heading">
        <div><span>Identity and access</span><h1>Users</h1><p>Manage accounts, company access, administrative roles, and login delivery.</p></div>
        <CreateUserForm companies={companies ?? []} />
      </div>

      <div className="superadmin-stat-grid">
        <div className="superadmin-stat"><span><Users size={17} /></span><div><small>Total users</small><strong>{users.length}</strong><p>All authenticated accounts</p></div></div>
        <div className="superadmin-stat"><span><ShieldCheck size={17} /></span><div><small>Administrators</small><strong>{users.filter((item) => item.role === "admin" || item.role === "superadmin").length}</strong><p>Privileged workspace access</p></div></div>
        <div className="superadmin-stat"><span><Building2 size={17} /></span><div><small>Unassigned</small><strong>{users.filter((item) => !item.company_id && item.role !== "superadmin").length}</strong><p>Need a company assignment</p></div></div>
      </div>

      {usersError && (
        <div className="superadmin-alert warning">
          <strong>{usersError}</strong><span>Ensure the service-role configuration is available to list authentication users.</span>
        </div>
      )}

      <section className="superadmin-surface">
        <div className="superadmin-section-heading"><div><h2>User directory</h2><p>Select recipients, edit access, or securely remove accounts.</p></div><span>{users.length} records</span></div>
        {users.length > 0 ? (
          <UsersList
            users={users}
            companies={companies ?? []}
            currentUserId={user.id}
          />
        ) : (
          <div className="superadmin-empty">
            <UserRound size={26} /><strong>{usersError ? "Could not load users" : "No users yet"}</strong><p>{usersError ? "Check the server configuration and refresh this page." : "Create the first user account to get started."}</p>
          </div>
        )}
      </section>
    </div>
  );
}
