import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUsersWithProfiles } from "@/app/actions/superadmin";
import UsersList from "../users-list";
import CreateUserForm from "../create-user-form";

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
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-black uppercase italic tracking-tight">
          Users
        </h1>
        <CreateUserForm companies={companies ?? []} />
      </div>

      {usersError && (
        <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-xl">
          <p className="text-sm font-bold text-amber-800">
            {usersError}
          </p>
          <p className="text-xs mt-1 text-amber-600">
            Ensure SUPABASE_SERVICE_ROLE_KEY is set in .env.local to list users.
          </p>
        </div>
      )}

      <div className="bg-white border-4 border-black rounded-[24px] overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        {users.length > 0 ? (
          <UsersList
            users={users}
            companies={companies ?? []}
            currentUserId={user.id}
          />
        ) : (
          <div className="p-12 text-center text-slate-500">
            <p className="font-bold uppercase tracking-wider">
              {usersError ? "Could not load users" : "No users yet"}
            </p>
            <p className="text-sm mt-2">
              {usersError ? "Check your service role key" : "Create a user above"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
