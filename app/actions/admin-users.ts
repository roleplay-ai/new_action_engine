"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertUserCredentialDelivery } from "@/lib/user-credential-delivery";

async function ensureCompanyAdmin(): Promise<{
  userId: string;
  companyId: string;
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

  if (profile?.role !== "admin" && profile?.role !== "superadmin") {
    throw new Error("Forbidden: admin only");
  }

  if (profile.role === "admin" && !profile.company_id) {
    throw new Error("Admin is not assigned to a company");
  }

  return {
    userId: user.id,
    companyId: profile.company_id!,
    role: profile.role,
  };
}

export async function createCompanyUser(params: {
  email: string;
  password: string;
  fullName: string;
  companyId: string;
}): Promise<{ error?: string; userId?: string }> {
  try {
    const caller = await ensureCompanyAdmin();

    // Admins can only create users in their own company
    const targetCompanyId =
      caller.role === "admin" ? caller.companyId : params.companyId;

    if (!targetCompanyId) {
      return { error: "No company specified" };
    }

    const admin = createAdminClient();

    const { data, error } = await admin.auth.admin.createUser({
      email: params.email,
      password: params.password,
      email_confirm: true,
      user_metadata: { full_name: params.fullName },
    });

    if (error) return { error: error.message };
    const userId = data.user?.id;
    if (!userId) return { error: "User created but no ID returned" };

    const { error: profileError } = await admin
      .from("profiles")
      .upsert(
        {
          id: userId,
          full_name: params.fullName,
          company_id: targetCompanyId,
          role: "user",
          persistent_login_key: crypto.randomUUID(),
        },
        { onConflict: "id" }
      );

    if (profileError) return { error: profileError.message };

    const { error: credError } = await upsertUserCredentialDelivery(admin, {
      userId,
      email: params.email,
      plaintextPassword: params.password,
    });
    if (credError) return { error: credError };

    revalidatePath("/admin");
    return { userId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function getCompanyUsersWithDetails(companyId: string): Promise<{
  error?: string;
  users?: Array<{
    id: string;
    email: string;
    full_name: string | null;
    role: string;
  }>;
}> {
  try {
    await ensureCompanyAdmin();
    const admin = createAdminClient();

    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, full_name, role")
      .eq("company_id", companyId)
      .order("full_name");

    if (profilesError) return { error: profilesError.message };
    if (!profiles || profiles.length === 0) return { users: [] };

    const { data: usersData, error: usersError } =
      await admin.auth.admin.listUsers({ perPage: 1000 });
    if (usersError) return { error: usersError.message };

    const emailMap = new Map(
      (usersData?.users ?? []).map((u) => [u.id, u.email ?? ""])
    );

    const users = profiles.map((p) => ({
      id: p.id,
      email: emailMap.get(p.id) ?? "",
      full_name: p.full_name,
      role: p.role,
    }));

    return { users };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function removeUserFromAdminCompany(
  userId: string,
  companyId: string
): Promise<{ error?: string }> {
  try {
    const caller = await ensureCompanyAdmin();

    const targetCompanyId =
      caller.role === "admin" ? caller.companyId : companyId;

    const supabase = await createClient();
    const admin = createAdminClient();

    // Verify the target user belongs to this company
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", userId)
      .single();

    if (targetProfile?.company_id !== targetCompanyId) {
      return { error: "User does not belong to your company" };
    }

    // Prevent removing another admin
    if (targetProfile?.role === "admin" || targetProfile?.role === "superadmin") {
      return { error: "Cannot remove admin users" };
    }

    const { error } = await admin
      .from("profiles")
      .update({ company_id: null })
      .eq("id", userId);

    if (error) return { error: error.message };
    revalidatePath("/admin");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}
