"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || "admin@actionengine").toLowerCase();

async function ensureSuperadmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const isSuperadminEmail = user.email?.toLowerCase() === SUPERADMIN_EMAIL;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "superadmin" && !isSuperadminEmail) {
    throw new Error("Forbidden: superadmin only");
  }
  return supabase;
}

export async function createCompany(params: {
  name: string;
  slug?: string;
}): Promise<{ error?: string }> {
  try {
    const supabase = await ensureSuperadmin();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { error } = await supabase.from("companies").insert({
      name: params.name,
      slug: params.slug?.trim() || null,
      created_by: user.id,
    });

    if (error) return { error: error.message };
    revalidatePath("/superadmin");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateCompany(
  id: string,
  params: { name: string; slug?: string }
): Promise<{ error?: string }> {
  try {
    await ensureSuperadmin();
    const supabase = await createClient();

    const { error } = await supabase
      .from("companies")
      .update({
        name: params.name,
        slug: params.slug?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { error: error.message };
    revalidatePath("/superadmin");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}
