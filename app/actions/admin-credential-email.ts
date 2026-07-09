"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSendGridConfigured } from "@/lib/sendgrid";
import { sendTemplateToUsers } from "@/lib/email-send";
import { buildWeeklyEmailTemplateDataForUser } from "@/lib/weekly-email";

/** SendGrid dynamic template for Admin → Email Management (credential) sends only. */
const CREDENTIAL_EMAIL_TEMPLATE_ID = "d-b01c0c8996d745a39f604a686913a5c1";

export type CredentialEmailUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  hasStoredCredentials: boolean;
};

async function getCallerAdminForCompany(companyId: string): Promise<{ userId: string }> {
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

  if (profile.role === "admin") {
    if (!profile.company_id) throw new Error("Admin is not assigned to a company");
    if (profile.company_id !== companyId) {
      throw new Error("Forbidden: not your company");
    }
  }

  return { userId: user.id };
}

/**
 * Company users with flag for stored id/password (for SendGrid credential sends).
 */
export async function listUsersForCredentialEmail(
  companyId: string
): Promise<{ users?: CredentialEmailUserRow[]; error?: string }> {
  try {
    if (!companyId) return { error: "No company selected" };
    await getCallerAdminForCompany(companyId);

    const admin = createAdminClient();

    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, full_name, role")
      .eq("company_id", companyId)
      .order("full_name");

    if (profilesError) return { error: profilesError.message };
    if (!profiles || profiles.length === 0) return { users: [] };

    const ids = profiles.map((p) => p.id);

    const { data: credRows } = await admin
      .from("user_credential_delivery")
      .select("user_id")
      .in("user_id", ids);
    const credSet = new Set((credRows ?? []).map((r) => r.user_id as string));

    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({
      perPage: 1000,
    });
    if (usersError) return { error: usersError.message };

    const emailMap = new Map(
      (usersData?.users ?? []).map((u) => [u.id, u.email ?? ""])
    );

    const users: CredentialEmailUserRow[] = profiles.map((p) => ({
      id: p.id,
      email: emailMap.get(p.id) ?? "",
      full_name: p.full_name,
      role: p.role ?? "user",
      hasStoredCredentials: credSet.has(p.id),
    }));

    return { users };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export type SendCredentialEmailResult = {
  userId: string;
  email: string;
  success: boolean;
  error?: string;
};

/**
 * Sends the credential SendGrid template with weekly template data plus:
 * login_email, temporary_password, app_login_url (and standard login_url, first_name, company_logo).
 * Does not delete rows in user_credential_delivery.
 */
export async function sendLoginCredentialsEmails(
  companyId: string,
  userIds: string[]
): Promise<{ results: SendCredentialEmailResult[]; error?: string }> {
  try {
    if (!companyId) return { results: [], error: "No company selected" };
    if (userIds.length === 0) return { results: [], error: "No users selected" };

    const { userId: sentBy } = await getCallerAdminForCompany(companyId);

    if (!isSendGridConfigured()) {
      return {
        results: [],
        error: "SendGrid not configured. Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL.",
      };
    }

    const admin = createAdminClient();
    const { data: allowedProfiles } = await admin
      .from("profiles")
      .select("id")
      .eq("company_id", companyId)
      .in("id", userIds);

    const allowed = new Set((allowedProfiles ?? []).map((p) => p.id));
    const invalid = userIds.filter((id) => !allowed.has(id));
    if (invalid.length > 0) {
      return {
        results: [],
        error: "Some selected users are not in this company.",
      };
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const fromEmail = process.env.SENDGRID_FROM_EMAIL!;

    const results = await sendTemplateToUsers({
      userIds,
      templateId: CREDENTIAL_EMAIL_TEMPLATE_ID,
      fromEmail,
      baseUrl,
      sentBy,
      includeStoredCredentials: true,
      getPerUserTemplateData: async (uid) => {
        const data = await buildWeeklyEmailTemplateDataForUser(uid, { baseUrl });
        return data as unknown as Record<string, unknown>;
      },
    });

    revalidatePath("/admin/control-panel/email");
    return { results };
  } catch (e) {
    return { results: [], error: e instanceof Error ? e.message : "Failed" };
  }
}
