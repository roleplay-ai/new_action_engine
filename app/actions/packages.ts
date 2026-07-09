"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { istToUTCTime, istToUTCDate } from "@/lib/timezone-utils";

export async function getCompanyUsers(companyId: string): Promise<
  { error?: string; users?: { id: string; full_name: string | null }[] }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: profile } = await supabase.from("profiles").select("role, company_id").eq("id", user.id).single();
    const role = profile?.role ?? "user";
    if (role !== "admin" && role !== "superadmin") return { error: "Forbidden" };
    if (role === "admin" && profile?.company_id !== companyId) return { error: "Access denied" };

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("company_id", companyId)
      .eq("role", "user");

    const users = (profiles ?? []).map((p) => ({
      id: p.id,
      full_name: p.full_name,
    }));
    return { users };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

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

export async function createPackage(params: {
  name: string;
  description?: string;
  startDate?: string;
  durationWeeks?: number;
  /** Time of initial package activation (IST), not per-delivery time. */
  activationTime?: string;
  /** Backwards-compatible alias; treated as activationTime if provided. */
  deliveryTime?: string;
  companyId?: string;
}): Promise<{ error?: string; id?: string }> {
  try {
    const { supabase, userId, companyId, role } = await getAdminContext();

    const resolvedCompanyId = role === "admin" ? companyId : params.companyId;
    if (!resolvedCompanyId) {
      return { error: "Company required" };
    }

    const activationTimeIST = params.activationTime ?? params.deliveryTime ?? null;
    const activationTimeUTC = activationTimeIST ? istToUTCTime(activationTimeIST) : null;

    const { data, error } = await supabase
      .from("packages")
      .insert({
        company_id: resolvedCompanyId,
        created_by: userId,
        name: params.name.trim(),
        description: params.description?.trim() || null,
        start_date: params.startDate || null,
        duration_weeks: params.durationWeeks ?? 8,
        delivery_time: activationTimeUTC,
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

export async function addActionsToPackage(
  packageId: string,
  actionIds: string[],
  companyId?: string
): Promise<{ error?: string }> {
  try {
    const { supabase, companyId: myCompanyId, role } = await getAdminContext();

    const { data: pkg } = await supabase
      .from("packages")
      .select("company_id")
      .eq("id", packageId)
      .single();
    if (!pkg) return { error: "Package not found" };
    if (role === "admin" && pkg.company_id !== myCompanyId) {
      return { error: "Access denied" };
    }

    for (let i = 0; i < actionIds.length; i++) {
      const { error } = await supabase.from("package_actions").upsert(
        {
          package_id: packageId,
          action_id: actionIds[i],
          week_number: Math.floor(i / 2) + 1,
          sort_order: i,
        },
        { onConflict: "package_id,action_id" }
      );
      if (error) return { error: error.message };
    }
    revalidatePath("/admin");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Configure per-delivery dates/times and actions for a package.
 * This replaces existing package_actions for the package with the provided configuration.
 */
export async function configurePackageDeliveries(
  packageId: string,
  deliveries: {
    weekNumber: number;
    deliveryDate?: string | null;
    deliveryTime?: string | null;
    actionIds: string[];
  }[]
): Promise<{ error?: string }> {
  try {
    const { supabase, companyId: myCompanyId, role } = await getAdminContext();

    // Check package ownership
    const { data: pkg } = await supabase
      .from("packages")
      .select("company_id")
      .eq("id", packageId)
      .single();
    if (!pkg) return { error: "Package not found" };
    if (role === "admin" && pkg.company_id !== myCompanyId) {
      return { error: "Access denied" };
    }

    // Clear existing mappings for this package so we can fully redefine deliveries.
    const { error: delErr } = await supabase
      .from("package_actions")
      .delete()
      .eq("package_id", packageId);
    if (delErr) return { error: delErr.message };

    const rows: {
      package_id: string;
      action_id: string;
      week_number: number;
      delivery_date: string | null;
      delivery_time: string | null;
      sort_order: number;
    }[] = [];

    let sortOrder = 0;
    for (const d of deliveries) {
      const week = d.weekNumber;
      // Date is stored as-is (no timezone conversion needed for dates)
      // Only time is converted from IST to UTC
      const deliveryDateNoConversion = d.deliveryDate ?? null;
      const deliveryTimeUTC = d.deliveryTime ? istToUTCTime(d.deliveryTime) : null;
      
      for (const actionId of d.actionIds) {
        rows.push({
          package_id: packageId,
          action_id: actionId,
          week_number: week,
          delivery_date: deliveryDateNoConversion, // Store date as-is
          delivery_time: deliveryTimeUTC, // Convert time IST → UTC
          sort_order: sortOrder++,
        });
      }
    }

    if (rows.length) {
      const { error: insErr } = await supabase
        .from("package_actions")
        .insert(rows);
      if (insErr) return { error: insErr.message };
    }

    revalidatePath("/admin");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function assignPackageToUsers(
  packageId: string,
  userIds: string[],
  scheduledStartDate?: string
): Promise<{ error?: string }> {
  try {
    const { supabase, companyId: myCompanyId, role } = await getAdminContext();

    const { data: pkg } = await supabase
      .from("packages")
      .select("company_id")
      .eq("id", packageId)
      .single();
    if (!pkg) return { error: "Package not found" };
    if (role === "admin" && pkg.company_id !== myCompanyId) {
      return { error: "Access denied" };
    }

    const { data: packageActions } = await supabase
      .from("package_actions")
      .select("action_id")
      .eq("package_id", packageId)
      .order("sort_order");

    if (!packageActions?.length) {
      return { error: "Package has no actions. Add actions first." };
    }

    for (const uid of userIds) {
      const { error: assignErr } = await supabase
        .from("package_assignments")
        .upsert(
          {
            package_id: packageId,
            user_id: uid,
            scheduled_start_date: scheduledStartDate || null,
          },
          { onConflict: "package_id,user_id" }
        );
      if (assignErr) return { error: assignErr.message };
    }

    revalidatePath("/admin");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}
