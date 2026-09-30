import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SuperadminShell from "./superadmin-shell";

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

  // Feeds the console-wide company selector in the top bar.
  const { data: companies } = await supabase.from("companies").select("id, name, slug").order("name");

  return (
    <SuperadminShell displayName={displayName} email={user.email ?? "Superadmin"} companies={companies ?? []}>
      {children}
    </SuperadminShell>
  );
}
