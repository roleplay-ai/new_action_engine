/**
 * Shared utility for sending templated emails to a list of users.
 * Generates auto-login URLs, sends via Resend, and writes audit rows to
 * email_campaign_logs.  Used by both the manual campaign action and the
 * scheduled cron handler.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { resend } from "@/lib/resend";
import { isEmailTemplateKey, renderEmailTemplate, type EmailTemplateKey } from "@/lib/email-templates";

export type SendToUsersResult = {
  userId: string;
  email: string;
  success: boolean;
  error?: string;
};

function isEmailDebugEnabled(): boolean {
  const v = (process.env.EMAIL_DEBUG_LOG ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function omitUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function safeTemplateDataSummary(data: Record<string, unknown>) {
  const actions = Array.isArray((data as any).actions) ? ((data as any).actions as any[]) : [];
  const actionWhats = actions
    .map((a) => (a && typeof a === "object" ? (a as any).what : undefined))
    .filter((s) => typeof s === "string")
    .slice(0, 3) as string[];

  return {
    keys: Object.keys(data).sort(),
    actions_count: actions.length,
    actions_what_sample: actionWhats,
    rank: (data as any).rank,
    status: (data as any).status,
    league: (data as any).league,
    score: (data as any).score,
    first_name: (data as any).first_name,
    company_name: (data as any).company_name,
    // login_url may contain an auth key; don't print it.
    login_url_present: typeof (data as any).login_url === "string" && !!(data as any).login_url,
    has_login_email: typeof (data as any).login_email === "string",
    temporary_password_present:
      typeof (data as any).temporary_password === "string" &&
      !!(data as any).temporary_password,
  };
}

export async function sendTemplateToUsers({
  userIds,
  templateId,
  fromEmail,
  baseUrl,
  sentBy,
  extraTemplateData = {},
  getPerUserTemplateData,
  includeStoredCredentials = false,
  loginPath,
}: {
  userIds: string[];
  /** Key of a template defined in lib/email-templates.ts (e.g. "weekly_challenges", "credentials"). */
  templateId: string;
  fromEmail: string;
  baseUrl: string;
  sentBy: string | null;
  extraTemplateData?: Record<string, unknown>;
  getPerUserTemplateData?: (userId: string) => Promise<Record<string, unknown>>;
  /** When true, merges login_email, temporary_password, app_login_url from user_credential_delivery (row is not deleted). */
  includeStoredCredentials?: boolean;
  /** Optional safe in-app destination after auto-login, e.g. "/actions". */
  loginPath?: string;
}): Promise<SendToUsersResult[]> {
  if (!isEmailTemplateKey(templateId)) {
    return userIds.map((userId) => ({
      userId,
      email: "",
      success: false,
      error: `Unknown email template "${templateId}"`,
    }));
  }
  const templateKey: EmailTemplateKey = templateId;

  const admin = createAdminClient();

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, persistent_login_key, full_name")
    .in("id", userIds);

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; persistent_login_key: string | null; full_name: string | null }) => [
      p.id,
      { key: p.persistent_login_key, fullName: p.full_name },
    ])
  );

  const credentialMap = new Map<string, { email: string; plaintext_password: string }>();
  if (includeStoredCredentials) {
    const { data: credRows } = await admin
      .from("user_credential_delivery")
      .select("user_id, email, plaintext_password")
      .in("user_id", userIds);
    for (const row of credRows ?? []) {
      credentialMap.set(row.user_id as string, {
        email: row.email as string,
        plaintext_password: row.plaintext_password as string,
      });
    }
  }

  // Supabase listUsers is paginated. Loading only the first page silently
  // skipped recipients in larger organisations, so keep paging until every
  // requested account has been resolved or there are no more auth users.
  const wantedUserIds = new Set(userIds);
  const userEmailMap = new Map<string, string | undefined>();
  const perPage = 1000;
  for (let page = 1; wantedUserIds.size > 0; page += 1) {
    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page, perPage });
    if (usersError) break;
    for (const authUser of usersData?.users ?? []) {
      if (!wantedUserIds.has(authUser.id)) continue;
      userEmailMap.set(authUser.id, authUser.email);
      wantedUserIds.delete(authUser.id);
    }
    if ((usersData?.users ?? []).length < perPage) break;
  }

  const results: SendToUsersResult[] = [];
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const appLoginUrl = `${normalizedBase}/login`;

  for (const userId of userIds) {
    const email = userEmailMap.get(userId);
    const prof = profileMap.get(userId);
    const key = prof?.key ?? null;

    if (!email) {
      results.push({ userId, email: "", success: false, error: "User email not found" });
      continue;
    }
    if (!key && !includeStoredCredentials) {
      results.push({ userId, email, success: false, error: "No login key (run migrations)" });
      continue;
    }

    if (includeStoredCredentials && !credentialMap.has(userId)) {
      results.push({
        userId,
        email,
        success: false,
        error: "No stored credentials for this user (create user from admin or re-save password)",
      });
      continue;
    }

    const safeLoginPath = loginPath?.startsWith("/") && !loginPath.startsWith("//")
      ? loginPath
      : undefined;
    const loginUrl = key
      ? `${normalizedBase}/api/auto-login?key=${encodeURIComponent(key)}${safeLoginPath ? `&next=${encodeURIComponent(safeLoginPath)}` : ""}`
      : appLoginUrl;
    const firstName =
      (prof?.fullName ?? "").trim().split(/\s+/)[0] ||
      email.split("@")[0] ||
      "there";

    try {
      const perUser = getPerUserTemplateData ? await getPerUserTemplateData(userId) : {};
      const cleanedExtra = omitUndefined(extraTemplateData);
      const cleanedPerUser = omitUndefined(perUser);
      const cred = includeStoredCredentials ? credentialMap.get(userId) : undefined;
      const dynamicTemplateData: Record<string, unknown> = {
        login_url: loginUrl,
        first_name: firstName,
        company_logo: `${normalizedBase}/icon.png`,
        ...cleanedExtra,
        ...cleanedPerUser,
      };
      if (includeStoredCredentials && cred) {
        dynamicTemplateData.login_email = cred.email;
        dynamicTemplateData.temporary_password = cred.plaintext_password;
        dynamicTemplateData.app_login_url = appLoginUrl;
      }

      if (isEmailDebugEnabled()) {
        console.log("[email-send] sending template email", {
          userId,
          email,
          templateId,
          fromEmail,
          data: safeTemplateDataSummary(dynamicTemplateData),
        });
      }

      const { subject, html } = renderEmailTemplate(templateKey, dynamicTemplateData);
      const { error: sendError } = await resend.emails.send({
        to: email,
        from: fromEmail,
        subject,
        html,
      });
      if (sendError) throw new Error(sendError.message);

      await admin.from("email_campaign_logs").insert({
        user_id: userId,
        email,
        template_id: templateId,
        status: "sent",
        sent_by: sentBy,
      });

      results.push({ userId, email, success: true });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Resend error";

      if (isEmailDebugEnabled()) {
        console.log("[email-send] failed sending template email", {
          userId,
          email,
          templateId,
          error: errorMessage,
        });
      }

      await admin.from("email_campaign_logs").insert({
        user_id: userId,
        email,
        template_id: templateId,
        status: "failed",
        error_message: errorMessage,
        sent_by: sentBy,
      });

      results.push({ userId, email, success: false, error: errorMessage });
    }
  }

  return results;
}
