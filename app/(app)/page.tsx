import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
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

  // Redirect by role; treat known superadmin email as superadmin even if profile not yet synced
  const effectiveRole = profile?.role === "superadmin" || isSuperadminEmail ? "superadmin" : profile?.role;
  if (effectiveRole === "superadmin") redirect("/superadmin");
  if (effectiveRole === "admin") redirect("/admin");

  redirect("/journey");
}
