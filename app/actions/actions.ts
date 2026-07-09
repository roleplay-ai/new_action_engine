"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionTheme } from "@/lib/types";

async function getAdminContext(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  companyId: string | null;
  role: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "user";
  if (role !== "admin" && role !== "superadmin") {
    throw new Error("Forbidden: admin or superadmin only");
  }

  return {
    supabase,
    userId: user.id,
    companyId: profile?.company_id ?? null,
    role,
  };
}

export async function createAction(params: {
  theme: ActionTheme;
  title: string;
  how: string;
  why: string;
  timeEstimate?: string;
  companyId?: string; // required for superadmin; ignored for admin (uses their company)
}): Promise<{ error?: string; id?: string }> {
  try {
    const { supabase, userId, companyId, role } = await getAdminContext();

    const resolvedCompanyId = role === "admin" ? companyId : params.companyId;
    if (!resolvedCompanyId) {
      return { error: "Company required. Select a company (superadmin) or ensure you are assigned to one." };
    }

    const { data, error } = await supabase
      .from("actions")
      .insert({
        company_id: resolvedCompanyId,
        created_by: userId,
        theme: params.theme,
        title: params.title.trim(),
        how: params.how.trim(),
        why: params.why.trim(),
        time_estimate: params.timeEstimate ?? "5 mins",
        is_system_action: false,
      })
      .select("id")
      .single();

    if (error) return { error: error.message };
    revalidatePath("/admin");
    return { id: data.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateAction(
  id: string,
  params: {
    theme?: ActionTheme;
    title?: string;
    how?: string;
    why?: string;
    timeEstimate?: string;
  }
): Promise<{ error?: string }> {
  try {
    const { supabase, companyId, role } = await getAdminContext();

    if (role === "admin") {
      const { data: action } = await supabase
        .from("actions")
        .select("company_id")
        .eq("id", id)
        .single();
      if (!action || action.company_id !== companyId) {
        return { error: "Action not found or access denied" };
      }
    }

    const updates: Record<string, unknown> = {};
    if (params.theme != null) updates.theme = params.theme;
    if (params.title != null) updates.title = params.title.trim();
    if (params.how != null) updates.how = params.how.trim();
    if (params.why != null) updates.why = params.why.trim();
    if (params.timeEstimate != null) updates.time_estimate = params.timeEstimate;

    const { error } = await supabase.from("actions").update(updates).eq("id", id);

    if (error) return { error: error.message };
    revalidatePath("/admin");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteAction(id: string): Promise<{ error?: string }> {
  try {
    const { supabase, companyId, role } = await getAdminContext();

    if (role === "admin") {
      const { data: action } = await supabase
        .from("actions")
        .select("company_id")
        .eq("id", id)
        .single();
      if (!action || action.company_id !== companyId) {
        return { error: "Action not found or access denied" };
      }
    }

    const { data: inUse } = await supabase
      .from("user_actions")
      .select("id")
      .eq("action_id", id)
      .limit(1)
      .maybeSingle();

    if (inUse) {
      return { error: "Cannot delete: action is in use by users. Consider hiding or archiving instead." };
    }

    const { error } = await supabase.from("actions").delete().eq("id", id);

    if (error) return { error: error.message };
    revalidatePath("/admin");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}
