import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { LogoutButton } from "../logout-button";
import { Building2, Mail, Users, Zap, Library, GraduationCap } from "lucide-react";

export default async function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const superadminEmail = (process.env.SUPERADMIN_EMAIL || "admin@actionengine").toLowerCase();
  const isSuperadminEmail = user.email?.toLowerCase() === superadminEmail;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  // Allow known superadmin email even if profile fetch failed or is stale (stops redirect loop)
  if (profile?.role !== "superadmin" && !isSuperadminEmail) {
    redirect("/");
  }

  const displayName = profile?.full_name || user.email?.split("@")[0] || "Superadmin";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b-2 border-black bg-white sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-6">
              <Link
                href="/superadmin"
                className="flex items-center gap-2 font-black uppercase text-sm tracking-tight hover:text-slate-600"
              >
                <Zap size={18} className="text-[#FFCE00]" />
                Superadmin
              </Link>
              <nav className="flex gap-1">
                <Link
                  href="/superadmin"
                  className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100 hover:text-black transition-colors flex items-center gap-1.5"
                >
                  <Building2 size={16} />
                  <span className="hidden sm:inline">Companies</span>
                </Link>
                <Link
                  href="/superadmin/users"
                  className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100 hover:text-black transition-colors flex items-center gap-1.5"
                >
                  <Users size={16} />
                  <span className="hidden sm:inline">Users</span>
                </Link>
                <Link
                  href="/superadmin/emails"
                  className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100 hover:text-black transition-colors flex items-center gap-1.5"
                >
                  <Mail size={16} />
                  <span className="hidden sm:inline">Emails</span>
                </Link>
                <Link
                  href="/superadmin/content-library"
                  className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100 hover:text-black transition-colors flex items-center gap-1.5"
                >
                  <Library size={16} />
                  <span className="hidden sm:inline">Content Library</span>
                </Link>
                <Link
                  href="/admin/control-panel/cohorts"
                  className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100 hover:text-black transition-colors flex items-center gap-1.5"
                >
                  <GraduationCap size={16} />
                  <span className="hidden sm:inline">Cohorts</span>
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs font-bold text-slate-500 truncate max-w-[120px] sm:max-w-none">
                {displayName}
              </span>
              <LogoutButton />
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
