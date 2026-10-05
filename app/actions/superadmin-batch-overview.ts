"use server";

/**
 * Superadmin "Batch overview": pick a company and see, for every active batch
 * in it, the health numbers a superadmin needs at a glance — roster size, plan
 * uptake (drafted vs. activated), average Commitment Score, participants who
 * open emails but never validate an action, the current programme week, the
 * weekly email-opener average, the batch's email sender name, plus its
 * conversation feed and trainer announcements.
 *
 * Metric definitions intentionally match the rest of the app:
 *   - "Made a plan"      → generated a plan for the batch (a
 *                          personal_action_subscriptions row), activated or not.
 *   - "Activated plan"   → a commitment_wallet_plans row (finalised via
 *                          activate_my_commitment_wallet_plan) — same signal
 *                          as the admin Dashboard's "Activated action plan".
 *   - "Not activated"    → made a plan but never activated it. The admin
 *                          Dashboard's "not started" count = this + "No plan".
 *   - "No plan"          → never generated a plan at all.
 *   - Commitment Score   → walletScorePct, the /wallet formula.
 *   - "Opened, no action"→ opened/clicked a daily reminder or Friday recap for
 *                          the batch, with zero validated (status='success')
 *                          actions in that batch — the "opened_no_action"
 *                          nudge audience without a time window.
 *   - Current week       → lib/cohort-week anchors (first delivery date).
 *   - Sender name        → cohorts.sender_name → trainer name → "Nudgeable",
 *                          the same fallback lib/email-send.ts uses.
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCohortWeekAnchors, weekNumberFor, weekRangeIst } from "@/lib/cohort-week";
import { loadCommitmentWalletByCohort } from "./admin-analytics";

type Admin = ReturnType<typeof createAdminClient>;

const PAGE_SIZE = 1000;
const OPENED_TEMPLATE_IDS = ["daily_reminder", "weekly_recap"];
const MESSAGES_PER_BATCH = 100;

async function requireSuperadmin(): Promise<void> {
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
}

/** Supabase caps a select at 1000 rows, so page until a short page comes back. */
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

/** Same formula as get_my_commitment_wallet() / the /wallet page. */
function walletScorePct(plannedActions: number, missedActions: number) {
  return plannedActions > 0 ? Math.round((Math.max(0, plannedActions - missedActions) * 100) / plannedActions) : 0;
}

async function loadProfiles(admin: Admin, ids: string[]) {
  const profiles = new Map<string, { fullName: string | null; role: string }>();
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, full_name, role")
      .in("id", ids.slice(i, i + PAGE_SIZE));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      profiles.set(row.id as string, {
        fullName: (row.full_name as string | null)?.trim() || null,
        role: row.role as string,
      });
    }
  }
  return profiles;
}

export type BatchWeekStatus =
  | { state: "not_started"; startsOnIst: string }
  | { state: "running"; week: number; maxWeeks: number | null; weekStartIst: string; weekEndIst: string }
  | { state: "finished"; week: number; maxWeeks: number };

export type BatchOverviewMessage = {
  id: string;
  senderName: string;
  senderRole: "trainer" | "participant";
  message: string;
  createdAt: string;
};

export type BatchOverviewNotice = {
  id: string;
  authorName: string;
  message: string;
  createdAt: string;
};

export type BatchOverview = {
  cohortId: string;
  batchName: string;
  moduleName: string | null;
  locked: boolean;
  trainerName: string | null;
  senderName: string;
  senderSource: "batch" | "trainer" | "default";
  week: BatchWeekStatus;
  totalUsers: number;
  /** Generated a plan, activated or not. */
  madePlan: number;
  activatedPlan: number;
  /** Made a plan but never activated it (madePlan − activatedPlan). */
  draftNotActivated: number;
  /** Never generated a plan. */
  noPlan: number;
  /** Mean Commitment Score among activated users; null when none have activated. */
  avgCommitmentPct: number | null;
  openedNoValidation: number;
  /** Mean unique participants per week who opened a reminder or Friday recap,
   * across weeks in which at least one such email was sent. */
  avgWeeklyOpeners: number | null;
  /** Unique openers in the current week (null before the batch starts). */
  currentWeekOpeners: number | null;
  totalMessages: number;
  messages: BatchOverviewMessage[];
  notices: BatchOverviewNotice[];
};

export type CompanyBatchOverview = {
  companyName: string;
  batches: BatchOverview[];
};

export async function getCompanyBatchOverview(
  companyId: string
): Promise<{ overview?: CompanyBatchOverview; error?: string }> {
  try {
    await requireSuperadmin();
    if (!companyId) return { error: "Select a company first" };

    const admin = createAdminClient();

    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("id, name")
      .eq("id", companyId)
      .maybeSingle();
    if (companyError) throw new Error(companyError.message);
    if (!company) return { error: "Company not found" };

    const { data: cohortRows, error: cohortError } = await admin
      .from("cohorts")
      .select("id, name, batch_name, module_name, locked, max_weeks, sender_name, trainer_id, created_at")
      .eq("company_id", companyId)
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    if (cohortError) throw new Error(cohortError.message);

    const cohorts = (cohortRows ?? []) as {
      id: string;
      name: string | null;
      batch_name: string | null;
      module_name: string | null;
      locked: boolean | null;
      max_weeks: number | null;
      sender_name: string | null;
      trainer_id: string | null;
    }[];
    const cohortIds = cohorts.map((c) => c.id);
    if (!cohortIds.length) return { overview: { companyName: company.name as string, batches: [] } };

    // ── Trainers (for sender-name fallback) ─────────────────────────────
    const trainerIds = [...new Set(cohorts.map((c) => c.trainer_id).filter((id): id is string => !!id))];
    const trainerNameById = new Map<string, string>();
    if (trainerIds.length) {
      const { data: trainers } = await admin.from("trainers").select("id, name").in("id", trainerIds);
      for (const t of trainers ?? []) if (t.name) trainerNameById.set(t.id as string, t.name as string);
    }

    // ── Participants per batch ──────────────────────────────────────────
    const members = await selectAllPages<{ user_id: string; cohort_id: string }>((from, to) =>
      admin.from("cohort_members").select("user_id, cohort_id").in("cohort_id", cohortIds).order("id").range(from, to)
    );
    const memberProfiles = await loadProfiles(admin, [...new Set(members.map((m) => m.user_id))]);
    const participantsByCohort = new Map<string, Set<string>>();
    const cohortsByUser = new Map<string, string[]>();
    for (const m of members) {
      if (memberProfiles.get(m.user_id)?.role !== "user") continue;
      const set = participantsByCohort.get(m.cohort_id) ?? new Set<string>();
      set.add(m.user_id);
      participantsByCohort.set(m.cohort_id, set);
      const list = cohortsByUser.get(m.user_id) ?? [];
      list.push(m.cohort_id);
      cohortsByUser.set(m.user_id, list);
    }
    const isMember = (userId: string | null, cohortId: string | null) =>
      !!userId && !!cohortId && !!participantsByCohort.get(cohortId)?.has(userId);

    // ── Plans ───────────────────────────────────────────────────────────
    const subscriptions = await selectAllPages<{ user_id: string; cohort_id: string | null }>((from, to) =>
      admin
        .from("personal_action_subscriptions")
        .select("user_id, cohort_id")
        .in("cohort_id", cohortIds)
        .order("id")
        .range(from, to)
    );
    const walletByCohort = await loadCommitmentWalletByCohort(admin, cohortIds);

    const madePlanKeys = new Set<string>();
    for (const s of subscriptions) if (isMember(s.user_id, s.cohort_id)) madePlanKeys.add(`${s.user_id}:${s.cohort_id}`);
    for (const [cohortId, entry] of walletByCohort) {
      for (const userId of entry.perUser.keys()) if (isMember(userId, cohortId)) madePlanKeys.add(`${userId}:${cohortId}`);
    }

    // ── Validated actions ───────────────────────────────────────────────
    const validated = await selectAllPages<{ user_id: string; cohort_id: string | null }>((from, to) =>
      admin
        .from("user_actions")
        .select("user_id, cohort_id")
        .in("cohort_id", cohortIds)
        .eq("status", "success")
        .order("id")
        .range(from, to)
    );
    const validatedKeys = new Set(validated.map((v) => `${v.user_id}:${v.cohort_id}`));

    // ── Reminder / recap email opens ────────────────────────────────────
    type LogRow = {
      user_id: string | null;
      cohort_id: string | null;
      created_at: string;
      opened_at: string | null;
      clicked_at: string | null;
    };
    const attributedLogs = await selectAllPages<LogRow>((from, to) =>
      admin
        .from("email_campaign_logs")
        .select("user_id, cohort_id, created_at, opened_at, clicked_at")
        .in("cohort_id", cohortIds)
        .in("template_id", OPENED_TEMPLATE_IDS)
        .eq("status", "sent")
        .order("id")
        .range(from, to)
    );
    // Older sends logged cohort_id as null; attribute them only when the
    // recipient belongs to exactly one batch in this company.
    const singleBatchUsers = [...cohortsByUser.entries()].filter(([, ids]) => ids.length === 1).map(([id]) => id);
    const legacyLogs: LogRow[] = [];
    for (let i = 0; i < singleBatchUsers.length; i += 200) {
      const chunk = singleBatchUsers.slice(i, i + 200);
      legacyLogs.push(
        ...(await selectAllPages<LogRow>((from, to) =>
          admin
            .from("email_campaign_logs")
            .select("user_id, cohort_id, created_at, opened_at, clicked_at")
            .is("cohort_id", null)
            .in("user_id", chunk)
            .in("template_id", OPENED_TEMPLATE_IDS)
            .eq("status", "sent")
            .order("id")
            .range(from, to)
        ))
      );
    }
    for (const row of legacyLogs) row.cohort_id = row.user_id ? cohortsByUser.get(row.user_id)?.[0] ?? null : null;

    const anchors = await resolveCohortWeekAnchors(admin, cohortIds);
    const now = new Date();

    // cohortId → week → { sent, openers }
    const weeklyByCohort = new Map<string, Map<number, { sent: number; openers: Set<string> }>>();
    const openedKeys = new Set<string>();
    for (const row of [...attributedLogs, ...legacyLogs]) {
      if (!row.cohort_id || !isMember(row.user_id, row.cohort_id)) continue;
      const anchor = anchors.get(row.cohort_id);
      if (!anchor) continue;
      const opened = !!row.opened_at || !!row.clicked_at;
      const week = weekNumberFor(new Date(row.created_at), anchor);
      const weeks = weeklyByCohort.get(row.cohort_id) ?? new Map();
      const bucket = weeks.get(week) ?? { sent: 0, openers: new Set<string>() };
      bucket.sent += 1;
      if (opened && row.user_id) {
        bucket.openers.add(row.user_id);
        openedKeys.add(`${row.user_id}:${row.cohort_id}`);
      }
      weeks.set(week, bucket);
      weeklyByCohort.set(row.cohort_id, weeks);
    }

    // ── Conversations + announcements ───────────────────────────────────
    const messageRows = await selectAllPages<{
      id: string;
      cohort_id: string;
      sender_id: string;
      message: string;
      created_at: string;
    }>((from, to) =>
      admin
        .from("cohort_messages")
        .select("id, cohort_id, sender_id, message, created_at")
        .in("cohort_id", cohortIds)
        .order("created_at", { ascending: false })
        .range(from, to)
    );
    const { data: noticeData, error: noticeError } = await admin
      .from("cohort_notices")
      .select("id, cohort_id, created_by, message, created_at")
      .in("cohort_id", cohortIds)
      .order("created_at", { ascending: false });
    if (noticeError) throw new Error(noticeError.message);
    const noticeRows = (noticeData ?? []) as {
      id: string;
      cohort_id: string;
      created_by: string;
      message: string;
      created_at: string;
    }[];

    const authorIds = [
      ...new Set([...messageRows.map((m) => m.sender_id), ...noticeRows.map((n) => n.created_by)]),
    ].filter((id) => !memberProfiles.has(id));
    const authorProfiles = await loadProfiles(admin, authorIds);
    const profileOf = (id: string) => memberProfiles.get(id) ?? authorProfiles.get(id);

    // ── Assemble per batch ──────────────────────────────────────────────
    const batches: BatchOverview[] = cohorts.map((cohort) => {
      const participants = participantsByCohort.get(cohort.id) ?? new Set<string>();
      const wallet = walletByCohort.get(cohort.id);

      let madePlan = 0;
      let draftNotActivated = 0;
      let activatedPlan = 0;
      let scoreSum = 0;
      let openedNoValidation = 0;
      for (const userId of participants) {
        const key = `${userId}:${cohort.id}`;
        const uc = wallet?.perUser.get(userId);
        const activated = !!uc && uc.maximum > 0;
        if (activated || madePlanKeys.has(key)) madePlan += 1;
        if (activated) {
          activatedPlan += 1;
          scoreSum += walletScorePct(uc.plannedActions, uc.missedActions);
        } else if (madePlanKeys.has(key)) {
          draftNotActivated += 1;
        }
        if (openedKeys.has(key) && !validatedKeys.has(key)) openedNoValidation += 1;
      }

      const anchor = anchors.get(cohort.id);
      let week: BatchWeekStatus;
      let currentWeekNumber: number | null = null;
      if (!anchor || now.getTime() < anchor.getTime()) {
        week = { state: "not_started", startsOnIst: anchor ? weekRangeIst(1, anchor).startIst : "" };
      } else {
        currentWeekNumber = weekNumberFor(now, anchor);
        if (cohort.max_weeks && currentWeekNumber > cohort.max_weeks) {
          week = { state: "finished", week: currentWeekNumber, maxWeeks: cohort.max_weeks };
        } else {
          const range = weekRangeIst(currentWeekNumber, anchor);
          week = {
            state: "running",
            week: currentWeekNumber,
            maxWeeks: cohort.max_weeks,
            weekStartIst: range.startIst,
            weekEndIst: range.endIst,
          };
        }
      }

      const weeks = [...(weeklyByCohort.get(cohort.id)?.values() ?? [])].filter((w) => w.sent > 0);
      const avgWeeklyOpeners = weeks.length
        ? Math.round((weeks.reduce((sum, w) => sum + w.openers.size, 0) / weeks.length) * 10) / 10
        : null;
      const currentWeekOpeners =
        currentWeekNumber != null ? weeklyByCohort.get(cohort.id)?.get(currentWeekNumber)?.openers.size ?? 0 : null;

      const trainerName = cohort.trainer_id ? trainerNameById.get(cohort.trainer_id) ?? null : null;
      const batchSender = cohort.sender_name?.trim();
      const senderName = batchSender || trainerName || "Nudgeable";
      const senderSource: BatchOverview["senderSource"] = batchSender ? "batch" : trainerName ? "trainer" : "default";

      const cohortMessages = messageRows.filter((m) => m.cohort_id === cohort.id);
      const messages: BatchOverviewMessage[] = cohortMessages
        .slice(0, MESSAGES_PER_BATCH)
        .reverse()
        .map((m) => {
          const sender = profileOf(m.sender_id);
          const role = sender?.role;
          return {
            id: m.id,
            senderName: sender?.fullName || "Batch member",
            senderRole: role === "admin" || role === "superadmin" || role === "trainer" ? "trainer" : "participant",
            message: m.message,
            createdAt: m.created_at,
          };
        });

      const notices: BatchOverviewNotice[] = noticeRows
        .filter((n) => n.cohort_id === cohort.id)
        .map((n) => ({
          id: n.id,
          authorName: profileOf(n.created_by)?.fullName || trainerName || "Trainer",
          message: n.message,
          createdAt: n.created_at,
        }));

      return {
        cohortId: cohort.id,
        batchName: cohort.batch_name?.trim() || cohort.name?.trim() || "Batch",
        moduleName: cohort.module_name?.trim() || null,
        locked: !!cohort.locked,
        trainerName,
        senderName,
        senderSource,
        week,
        totalUsers: participants.size,
        madePlan,
        activatedPlan,
        draftNotActivated,
        noPlan: participants.size - madePlan,
        avgCommitmentPct: activatedPlan > 0 ? Math.round(scoreSum / activatedPlan) : null,
        openedNoValidation,
        avgWeeklyOpeners,
        currentWeekOpeners,
        totalMessages: cohortMessages.length,
        messages,
        notices,
      };
    });

    return { overview: { companyName: company.name as string, batches } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to load batch overview" };
  }
}
