"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResendConfigured } from "@/lib/resend";
import { sendTemplateToUsers } from "@/lib/email-send";
import {
  NUDGE_APP_URL,
  NUDGE_PASSWORD_FALLBACK,
  NUDGE_TEMPLATE_KEY,
  nudgeContentUsesCredentials,
  validateNudgeContent,
  type NudgeContent,
  type NudgeKind,
} from "@/lib/nudge-email-content";

/**
 * Two manual, superadmin-only engagement nudges:
 *   - "opened_no_action": participants who opened a reminder / Friday recap
 *     in the chosen window but completed zero actions in that same window.
 *   - "no_plan": batch members who still haven't finalised an action plan
 *     (no commitment_wallet_plans row for that batch).
 * Neither is ever sent on a schedule.
 */

type Admin = ReturnType<typeof createAdminClient>;

/** Days to look back for "opened but no action"; null = since the batch started. */
export type NudgeWindowDays = 7 | 14 | null;

const OPENED_TEMPLATE_IDS = ["daily_reminder", "weekly_recap"];
const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const MAX_COPY_ADDRESSES = 10;
const PAGE_SIZE = 1000;

const LOGIN_PATH_BY_KIND: Record<NudgeKind, string> = {
  opened_no_action: "/actions",
  no_plan: "/plan",
};

async function requireSuperadmin(): Promise<{ userId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  const superadminEmail = (process.env.SUPERADMIN_EMAIL || "admin@actionengine").toLowerCase();
  const isSuperadminEmail = user.email?.toLowerCase() === superadminEmail;
  if (profile?.role !== "superadmin" && !isSuperadminEmail) {
    throw new Error("Forbidden: superadmin only");
  }

  return { userId: user.id };
}

/** Supabase caps a select at 1000 rows; a batch's reminder logs easily
 * exceed that after a few weeks, so page until a short page comes back. */
async function selectAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows;
}

type BatchInfo = { id: string; label: string };

async function loadScope(admin: Admin, companyId: string, cohortId: string | null) {
  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id, name, logo_url")
    .eq("id", companyId)
    .maybeSingle();
  if (companyError) throw new Error(companyError.message);
  if (!company) throw new Error("Company not found");

  let cohortQuery = admin
    .from("cohorts")
    .select("id, batch_name, module_name, created_at")
    .eq("company_id", companyId)
    .is("archived_at", null);
  if (cohortId) cohortQuery = cohortQuery.eq("id", cohortId);
  const { data: cohorts, error: cohortsError } = await cohortQuery.order("created_at", { ascending: false });
  if (cohortsError) throw new Error(cohortsError.message);
  if (cohortId && !(cohorts ?? []).length) throw new Error("Batch not found for this company");

  const batches: BatchInfo[] = (cohorts ?? []).map((cohort) => ({
    id: cohort.id as string,
    label: [cohort.batch_name, cohort.module_name].filter(Boolean).join(" — ") || "Batch",
  }));

  return {
    companyName: (company.name as string | null) ?? undefined,
    companyLogo: (company.logo_url as string | null) ?? undefined,
    batches,
  };
}

/** Participant (role='user') memberships across the given batches, as
 * user → batch ids, most recently joined batch first. */
async function loadMemberships(admin: Admin, cohortIds: string[]) {
  const byUser = new Map<string, string[]>();
  if (!cohortIds.length) return byUser;

  const members = await selectAllPages<{ user_id: string; cohort_id: string; created_at: string }>((from, to) =>
    admin
      .from("cohort_members")
      .select("user_id, cohort_id, created_at")
      .in("cohort_id", cohortIds)
      .order("created_at", { ascending: false })
      .range(from, to)
  );
  const userIds = [...new Set(members.map((member) => member.user_id))];
  if (!userIds.length) return byUser;

  const participantIds = new Set<string>();
  for (let i = 0; i < userIds.length; i += PAGE_SIZE) {
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, role")
      .in("id", userIds.slice(i, i + PAGE_SIZE));
    if (error) throw new Error(error.message);
    for (const profile of profiles ?? []) {
      if (profile.role === "user") participantIds.add(profile.id as string);
    }
  }

  for (const member of members) {
    if (!participantIds.has(member.user_id)) continue;
    const list = byUser.get(member.user_id) ?? [];
    list.push(member.cohort_id);
    byUser.set(member.user_id, list);
  }
  return byUser;
}

async function loadIdentities(admin: Admin, userIds: string[]) {
  const names = new Map<string, string>();
  for (let i = 0; i < userIds.length; i += PAGE_SIZE) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds.slice(i, i + PAGE_SIZE));
    for (const profile of profiles ?? []) {
      if (profile.full_name) names.set(profile.id as string, profile.full_name as string);
    }
  }

  const emails = new Map<string, string>();
  const wanted = new Set(userIds);
  for (let page = 1; wanted.size > 0; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) break;
    for (const authUser of data?.users ?? []) {
      if (!wanted.has(authUser.id)) continue;
      if (authUser.email) emails.set(authUser.id, authUser.email);
      wanted.delete(authUser.id);
    }
    if ((data?.users ?? []).length < PAGE_SIZE) break;
  }

  return { names, emails };
}

/** Splits a comma/semicolon/whitespace separated address list, dedupes it
 * case-insensitively, and rejects anything that isn't a plain address. */
function parseCopyAddresses(raw: string | undefined, label: string): string[] {
  const addresses: string[] = [];
  const seen = new Set<string>();
  for (const part of (raw ?? "").split(/[\s,;]+/)) {
    const address = part.trim();
    if (!address) continue;
    if (!EMAIL_PATTERN.test(address)) throw new Error(`${label}: "${address}" is not a valid email address`);
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    addresses.push(address);
  }
  if (addresses.length > MAX_COPY_ADDRESSES) throw new Error(`${label}: at most ${MAX_COPY_ADDRESSES} addresses`);
  return addresses;
}

export type NudgeRecipient = {
  userId: string;
  cohortId: string;
  name: string;
  /** profiles.full_name, used for the {{full_name}} variable. */
  fullName: string | null;
  email: string | null;
  batchLabel: string;
  /** opened_no_action only: most recent open/click of a reminder or recap in the window. */
  lastOpenedAt?: string;
  /** opened_no_action only: reminder/recap emails opened in the window. */
  openedCount?: number;
  /** When this same nudge was last sent to them, if ever. */
  lastNudgedAt: string | null;
  /** Whether a login password is stored for them (user_credential_delivery). */
  hasStoredPassword: boolean;
};

type MatchRow = { cohortId: string; lastOpenedAt?: string; openedCount?: number };

async function findOpenedNoAction(
  admin: Admin,
  memberships: Map<string, string[]>,
  cohortIds: string[],
  windowDays: NudgeWindowDays
): Promise<Map<string, MatchRow>> {
  const windowStart = windowDays ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000) : null;
  const windowStartMs = windowStart?.getTime() ?? 0;

  const logs = await selectAllPages<{
    user_id: string | null;
    cohort_id: string | null;
    opened_at: string | null;
    last_opened_at: string | null;
    clicked_at: string | null;
    last_clicked_at: string | null;
  }>((from, to) =>
    admin
      .from("email_campaign_logs")
      .select("user_id, cohort_id, opened_at, last_opened_at, clicked_at, last_clicked_at")
      .in("cohort_id", cohortIds)
      .in("template_id", OPENED_TEMPLATE_IDS)
      .eq("status", "sent")
      .not("opened_at", "is", null)
      .order("id")
      .range(from, to)
  );

  // Keyed by `${userId}:${cohortId}` so a person in two batches is judged
  // separately per batch.
  const opens = new Map<string, { lastOpenedMs: number; count: number }>();
  for (const log of logs) {
    if (!log.user_id || !log.cohort_id) continue;
    if (!memberships.get(log.user_id)?.includes(log.cohort_id)) continue;
    const latestMs = Math.max(
      ...[log.opened_at, log.last_opened_at, log.clicked_at, log.last_clicked_at]
        .filter((value): value is string => !!value)
        .map((value) => new Date(value).getTime())
    );
    if (latestMs < windowStartMs) continue;
    const key = `${log.user_id}:${log.cohort_id}`;
    const existing = opens.get(key);
    opens.set(key, {
      lastOpenedMs: Math.max(existing?.lastOpenedMs ?? 0, latestMs),
      count: (existing?.count ?? 0) + 1,
    });
  }
  if (!opens.size) return new Map();

  const openedUserIds = [...new Set([...opens.keys()].map((key) => key.split(":")[0]))];
  const acted = new Set<string>();
  for (let i = 0; i < openedUserIds.length; i += 200) {
    const completions = await selectAllPages<{ user_id: string; cohort_id: string | null }>((from, to) => {
      let query = admin
        .from("user_actions")
        .select("user_id, cohort_id")
        .in("user_id", openedUserIds.slice(i, i + 200))
        .in("cohort_id", cohortIds)
        .eq("status", "success");
      if (windowStart) query = query.gte("completed_at", windowStart.toISOString());
      return query.order("id").range(from, to);
    });
    for (const completion of completions) {
      if (completion.cohort_id) acted.add(`${completion.user_id}:${completion.cohort_id}`);
    }
  }

  const matches = new Map<string, MatchRow>();
  for (const [key, open] of opens) {
    if (acted.has(key)) continue;
    const [userId, cohortId] = key.split(":");
    const existing = matches.get(userId);
    // One email per person: keep the batch they joined most recently.
    const order = memberships.get(userId) ?? [];
    if (existing && order.indexOf(existing.cohortId) <= order.indexOf(cohortId)) continue;
    matches.set(userId, {
      cohortId,
      lastOpenedAt: new Date(open.lastOpenedMs).toISOString(),
      openedCount: open.count,
    });
  }
  return matches;
}

async function findNoPlan(
  admin: Admin,
  memberships: Map<string, string[]>,
  cohortIds: string[]
): Promise<Map<string, MatchRow>> {
  const plans = await selectAllPages<{ user_id: string; cohort_id: string }>((from, to) =>
    admin
      .from("commitment_wallet_plans")
      .select("user_id, cohort_id")
      .in("cohort_id", cohortIds)
      .order("id")
      .range(from, to)
  );
  const planned = new Set(plans.map((plan) => `${plan.user_id}:${plan.cohort_id}`));

  const matches = new Map<string, MatchRow>();
  for (const [userId, userCohortIds] of memberships) {
    // userCohortIds is most-recent-first, so the first unplanned batch wins.
    const cohortId = userCohortIds.find((id) => !planned.has(`${userId}:${id}`));
    if (cohortId) matches.set(userId, { cohortId });
  }
  return matches;
}

async function buildAudience(kind: NudgeKind, companyId: string, cohortId: string | null, windowDays: NudgeWindowDays) {
  const admin = createAdminClient();
  const scope = await loadScope(admin, companyId, cohortId);
  const cohortIds = scope.batches.map((batch) => batch.id);
  if (!cohortIds.length) return { ...scope, recipients: [] as NudgeRecipient[] };
  const memberships = await loadMemberships(admin, cohortIds);

  const matches =
    kind === "opened_no_action"
      ? await findOpenedNoAction(admin, memberships, cohortIds, windowDays)
      : await findNoPlan(admin, memberships, cohortIds);

  const matchedIds = [...matches.keys()];
  const { names, emails } = await loadIdentities(admin, matchedIds);

  const lastNudgedById = new Map<string, string>();
  for (let i = 0; i < matchedIds.length; i += 200) {
    const logs = await selectAllPages<{ user_id: string; created_at: string }>((from, to) =>
      admin
        .from("email_campaign_logs")
        .select("user_id, created_at")
        .in("user_id", matchedIds.slice(i, i + 200))
        .eq("template_id", NUDGE_TEMPLATE_KEY[kind])
        .eq("status", "sent")
        .order("created_at", { ascending: false })
        .range(from, to)
    );
    for (const log of logs) {
      if (!lastNudgedById.has(log.user_id)) lastNudgedById.set(log.user_id, log.created_at);
    }
  }

  const storedPasswordIds = new Set<string>();
  for (let i = 0; i < matchedIds.length; i += PAGE_SIZE) {
    const { data: credentialRows, error: credentialError } = await admin
      .from("user_credential_delivery")
      .select("user_id")
      .in("user_id", matchedIds.slice(i, i + PAGE_SIZE));
    if (credentialError) throw new Error(credentialError.message);
    for (const row of credentialRows ?? []) storedPasswordIds.add(row.user_id as string);
  }

  const labelById = new Map(scope.batches.map((batch) => [batch.id, batch.label]));

  const recipients: NudgeRecipient[] = [...matches.entries()]
    .map(([userId, match]) => ({
      userId,
      cohortId: match.cohortId,
      name: names.get(userId) ?? emails.get(userId)?.split("@")[0] ?? "Unnamed participant",
      fullName: names.get(userId)?.trim() || null,
      email: emails.get(userId) ?? null,
      batchLabel: labelById.get(match.cohortId) ?? "Batch",
      lastOpenedAt: match.lastOpenedAt,
      openedCount: match.openedCount,
      lastNudgedAt: lastNudgedById.get(userId) ?? null,
      hasStoredPassword: storedPasswordIds.has(userId),
    }))
    .sort((a, b) =>
      kind === "opened_no_action"
        ? (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? "")
        : a.name.localeCompare(b.name)
    );

  return { ...scope, recipients };
}

export type NudgeAudience = {
  recipients: NudgeRecipient[];
  /** Variable values for the live preview — the first matching participant. */
  sample: {
    full_name: string;
    first_name: string;
    company_name?: string;
    batch_name?: string;
    app_link: string;
    login_email: string;
    /** Masked — real passwords are only ever filled in server-side at send time. */
    password: string;
  };
};

/** Who currently matches the nudge, plus sample values for the preview. */
export async function getNudgeAudience(
  kind: NudgeKind,
  companyId: string,
  cohortId: string | null,
  windowDays: NudgeWindowDays = 7
): Promise<{ audience?: NudgeAudience; error?: string }> {
  try {
    await requireSuperadmin();
    if (!companyId) return { error: "Select a company first" };

    const { companyName, batches, recipients } = await buildAudience(kind, companyId, cohortId, windowDays);
    const first = recipients[0];
    const fullName = first?.fullName ?? "there";

    return {
      audience: {
        recipients,
        sample: {
          full_name: fullName,
          first_name: fullName.split(/\s+/)[0] || "there",
          company_name: companyName,
          batch_name: cohortId ? batches[0]?.label : first?.batchLabel,
          app_link: NUDGE_APP_URL,
          login_email: first?.email ?? "participant@company.com",
          password: first && !first.hasStoredPassword ? NUDGE_PASSWORD_FALLBACK : "••••••••",
        },
      },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not load recipients" };
  }
}

/** Sends the nudge to the selected participants, right now. The audience is
 * recomputed server-side and the selection is intersected with it, so a
 * stale screen can never email someone who no longer matches. */
export async function sendNudgeEmail(
  kind: NudgeKind,
  companyId: string,
  cohortId: string | null,
  windowDays: NudgeWindowDays,
  selectedUserIds: string[],
  content: NudgeContent,
  copies: { cc?: string; bcc?: string } = {}
): Promise<{ sent?: number; failed?: number; skipped?: number; error?: string }> {
  try {
    const { userId } = await requireSuperadmin();
    if (!isResendConfigured()) {
      return { error: "Email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL." };
    }
    if (!companyId) return { error: "Select a company first" };
    if (!selectedUserIds.length) return { error: "Select at least one participant" };
    const contentError = validateNudgeContent(content);
    if (contentError) return { error: contentError };
    const cc = parseCopyAddresses(copies.cc, "CC");
    const bcc = parseCopyAddresses(copies.bcc, "BCC");

    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!fromEmail) return { error: "RESEND_FROM_EMAIL is not set" };
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const { companyName, companyLogo, recipients } = await buildAudience(kind, companyId, cohortId, windowDays);
    const selected = new Set(selectedUserIds);
    const targets = recipients.filter((recipient) => selected.has(recipient.userId));
    const skipped = selectedUserIds.length - targets.length;
    if (!targets.length) return { skipped, error: "None of the selected participants match any more — refresh the list" };

    const targetById = new Map(targets.map((target) => [target.userId, target]));

    // Plaintext passwords are only read when the email actually uses them.
    const credentialsById = new Map<string, { email: string; password: string }>();
    if (nudgeContentUsesCredentials(content)) {
      const admin = createAdminClient();
      const targetIds = targets.map((target) => target.userId);
      for (let i = 0; i < targetIds.length; i += PAGE_SIZE) {
        const { data: credentialRows, error: credentialError } = await admin
          .from("user_credential_delivery")
          .select("user_id, email, plaintext_password")
          .in("user_id", targetIds.slice(i, i + PAGE_SIZE));
        if (credentialError) return { error: credentialError.message };
        for (const row of credentialRows ?? []) {
          credentialsById.set(row.user_id as string, {
            email: row.email as string,
            password: row.plaintext_password as string,
          });
        }
      }
    }

    const results = await sendTemplateToUsers({
      userIds: targets.map((target) => target.userId),
      templateId: NUDGE_TEMPLATE_KEY[kind],
      fromEmail,
      baseUrl,
      sentBy: userId,
      loginPath: LOGIN_PATH_BY_KIND[kind],
      cohortIdForUser: (id) => targetById.get(id)?.cohortId,
      extraTemplateData: {
        company_name: companyName,
        company_logo: companyLogo,
        custom_subject: content.subject.trim(),
        custom_body: content.body.trim(),
      },
      getPerUserTemplateData: async (id) => ({
        batch_name: targetById.get(id)?.batchLabel,
        full_name: targetById.get(id)?.fullName ?? "there",
        app_link: NUDGE_APP_URL,
        login_email: credentialsById.get(id)?.email ?? targetById.get(id)?.email ?? undefined,
        password: credentialsById.get(id)?.password ?? NUDGE_PASSWORD_FALLBACK,
      }),
      cc,
      bcc,
    });

    const sent = results.filter((result) => result.success).length;
    const failed = results.length - sent;
    return {
      sent,
      failed,
      skipped,
      error: sent === 0 ? results[0]?.error ?? "Could not send the email" : undefined,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not send the email" };
  }
}
