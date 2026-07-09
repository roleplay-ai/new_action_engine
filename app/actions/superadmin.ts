"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertUserCredentialDelivery } from "@/lib/user-credential-delivery";

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
}

/** Users page is under /superadmin/users — revalidating only /superadmin leaves this page stale. */
function revalidateSuperadminUserViews() {
  revalidatePath("/superadmin/users");
  revalidatePath("/superadmin/emails");
  revalidatePath("/superadmin", "layout");
}

export async function assignUserToCompany(
  userId: string,
  companyId: string
): Promise<{ error?: string }> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const { error } = await admin
      .from("profiles")
      .update({ company_id: companyId })
      .eq("id", userId);

    if (error) return { error: error.message };
    revalidateSuperadminUserViews();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function removeUserFromCompany(userId: string): Promise<{ error?: string }> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const { error } = await admin
      .from("profiles")
      .update({ company_id: null, role: "user" })
      .eq("id", userId);

    if (error) return { error: error.message };
    revalidateSuperadminUserViews();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function setCompanyAdmin(
  userId: string,
  companyId: string
): Promise<{ error?: string }> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const { error } = await admin
      .from("profiles")
      .update({ role: "admin", company_id: companyId })
      .eq("id", userId);

    if (error) return { error: error.message };
    revalidateSuperadminUserViews();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function removeCompanyAdmin(userId: string): Promise<{ error?: string }> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const { error } = await admin
      .from("profiles")
      .update({ role: "user" })
      .eq("id", userId);

    if (error) return { error: error.message };
    revalidateSuperadminUserViews();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateUserBySuperadmin(
  userId: string,
  params: {
    fullName: string;
    companyId: string | null;
    role: "user" | "admin";
  }
): Promise<{ error?: string }> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const { data: target, error: fetchErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (fetchErr || !target) {
      return { error: fetchErr?.message ?? "User profile not found" };
    }

    if (target.role === "superadmin") {
      const { error } = await admin
        .from("profiles")
        .update({ full_name: params.fullName.trim() || null })
        .eq("id", userId);
      if (error) return { error: error.message };
      const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: { full_name: params.fullName.trim() },
      });
      if (authErr) return { error: authErr.message };
      revalidateSuperadminUserViews();
      return {};
    }

    if (params.role === "admin" && !params.companyId) {
      return { error: "Company is required for company admin role" };
    }

    // Service role bypasses RLS. Session user updates were blocked when access came from
    // SUPERADMIN_EMAIL but profiles.role was not yet 'superadmin' (RLS checks role only).
    const { error } = await admin
      .from("profiles")
      .update({
        full_name: params.fullName.trim() || null,
        company_id: params.companyId,
        role: params.role,
      })
      .eq("id", userId);

    if (error) return { error: error.message };

    const { error: metaErr } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: { full_name: params.fullName.trim() },
    });
    if (metaErr) return { error: metaErr.message };

    revalidateSuperadminUserViews();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteUserBySuperadmin(userId: string): Promise<{ error?: string }> {
  try {
    await ensureSuperadmin();
    const supabase = await createClient();
    const {
      data: { user: me },
    } = await supabase.auth.getUser();
    if (!me) return { error: "Not authenticated" };
    if (me.id === userId) {
      return { error: "You cannot delete your own account" };
    }

    const admin = createAdminClient();
    const { data: target } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (target?.role === "superadmin") {
      return { error: "Cannot delete a superadmin account" };
    }

    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return { error: error.message };

    revalidateSuperadminUserViews();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function createUser(params: {
  email: string;
  password: string;
  fullName: string;
  companyId: string | null;
  role: "user" | "admin";
}): Promise<{ error?: string; userId?: string }> {
  try {
    await ensureSuperadmin();
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
          company_id: params.companyId,
          role: params.role,
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

    revalidateSuperadminUserViews();
    return { userId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function rotateAutoLoginKey(userId: string): Promise<{ error?: string }> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const { error } = await admin
      .from("profiles")
      .update({ persistent_login_key: crypto.randomUUID() })
      .eq("id", userId);

    if (error) return { error: error.message };
    revalidateSuperadminUserViews();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function getUsersWithProfiles(): Promise<
  { id: string; email: string; full_name: string; company_id: string | null; role: string; company_name: string | null; persistent_login_key: string | null }[] | { error: string }
> {
  try {
    await ensureSuperadmin();
    const admin = createAdminClient();

    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ perPage: 500 });
    if (usersError) return { error: usersError.message };

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, company_id, role, persistent_login_key");
    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.id, p])
    );

    const { data: companies } = await admin.from("companies").select("id, name");
    const companyMap = new Map((companies ?? []).map((c) => [c.id, c.name]));

    const result = (usersData?.users ?? []).map((u) => {
      const p = profileMap.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "",
        full_name: p?.full_name ?? u.user_metadata?.full_name ?? "",
        company_id: p?.company_id ?? null,
        role: p?.role ?? "user",
        company_name: p?.company_id ? companyMap.get(p.company_id) ?? null : null,
        persistent_login_key: p?.persistent_login_key ?? null,
      };
    });

    return result;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}
