"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Returns the path the current user should be redirected to after login.
 * Call this after signInWithPassword so the server sees the new session.
 */
export async function getRedirectPathAfterLogin(): Promise<"/superadmin/batch-overview" | "/admin" | "/"> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/";

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "superadmin") return "/superadmin/batch-overview";
  if (profile?.role === "admin") return "/admin";
  return "/";
}
