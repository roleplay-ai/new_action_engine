import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppLayoutShell from "./app-layout-shell";

export default async function AppLayout({
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

  let { data: profile } = await supabase
    .from("profiles")
    .select("full_name, company_id, role")
    .eq("id", user.id)
    .single();

  // On first sign-in: ensure profile exists (trigger may have missed or legacy user)
  if (!profile) {
    await supabase.from("profiles").upsert(
      {
        id: user.id,
        full_name: user.user_metadata?.full_name ?? null,
        avatar_url: user.user_metadata?.avatar_url ?? null,
        company_id: null,
        role: isSuperadminEmail ? "superadmin" : "user",
      },
      { onConflict: "id" }
    );
    const res = await supabase
      .from("profiles")
      .select("full_name, company_id, role")
      .eq("id", user.id)
      .single();
    profile = res.data;
  } else if (isSuperadminEmail && profile.role !== "superadmin") {
    // Sync: ensure known superadmin email always has superadmin role
    await supabase.from("profiles").update({ role: "superadmin", company_id: null }).eq("id", user.id);
    profile = { ...profile, role: "superadmin" as const, company_id: null };
  }

  const displayName =
    profile?.full_name?.trim() || user.email?.split("@")[0] || "User";
  const hasCompany = !!profile?.company_id;

  return (
    <AppLayoutShell
      displayName={displayName}
      hasCompany={hasCompany}
      role={profile?.role ?? "user"}
    >
      {children}
    </AppLayoutShell>
  );
}
