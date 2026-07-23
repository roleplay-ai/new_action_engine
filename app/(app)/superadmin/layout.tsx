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

  return (
    <SuperadminShell displayName={displayName} email={user.email ?? "Superadmin"}>
      {children}
    </SuperadminShell>
  );
}
