import { createAdminClient } from "@/lib/supabase/admin";
import { League } from "@/lib/types";

function leagueFromIndex(idx: number | null | undefined): League {
  switch (idx ?? 0) {
    case 1:
      return League.Bronze;
    case 2:
      return League.Silver;
    case 3:
      return League.Gold;
    case 4:
      return League.Diamond;
    default:
      return League.Starter;
  }
}

/** Normalise time string from DB to HH:MM:SS. */
function normaliseTimeString(timePart: string | null | undefined): string {
  if (timePart == null || typeof timePart !== "string") return "03:30:00"; // 09:00 IST default
  const s = timePart.trim();
  if (!s) return "03:30:00";
  const parts = s.split(":");
  const hour = parts[0] ?? "03";
  const minute = parts[1] ?? "30";
  const second = (parts[2] ?? "00").replace(/\D/g, "").slice(0, 2) || "00";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${second.padStart(2, "0")}`;
}

function activationDateUTC(baseDate: string, timePartUTC: string): Date | null {
  const t = normaliseTimeString(timePartUTC);
  const [yearStr, monthStr, dayStr] = baseDate.split("-");
  const [hourStr, minuteStr, secondStr] = t.split(":");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hourUTC = Number(hourStr);
  const minuteUTC = Number(minuteStr);
  const secondUTC = Number(secondStr ?? "0");
  if ([year, month, day, hourUTC, minuteUTC, secondUTC].some(Number.isNaN)) return null;
  const d = new Date(Date.UTC(year, month - 1, day, hourUTC, minuteUTC, secondUTC));
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDaysToDate(baseDate: string, days: number): string | null {
  const parts = baseDate.split("-");
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if ([year, month, day].some(Number.isNaN)) return null;
  const d = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export type WeeklyEmailAction = {
  theme: string;
  what: string;
  how: string;
  why: string;
  time: string;
};

export type WeeklyEmailTemplateData = {
  company_logo?: string;
  company_name?: string;
  first_name?: string;
  actions: WeeklyEmailAction[];
  rank: number | string;
  status: string;
  league: string;
  score: number | string;
  login_url?: string;
};

async function getAvailableActionsForUser(userId: string, limit: number): Promise<WeeklyEmailAction[]> {
  const admin = createAdminClient();
  const now = Date.now();
  const ONE_MINUTE_MS = 60 * 1000;

  const { data: prof } = await admin
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .single();
  const companyId = (prof as any)?.company_id as string | null | undefined;
  if (!companyId) return [];

  const { data: assignments } = await admin
    .from("package_assignments")
    .select("package_id, scheduled_start_date")
    .eq("user_id", userId);
  if (!assignments?.length) return [];

  const pkgIds = [...new Set(assignments.map((a: any) => a.package_id as string))];

  const [{ data: pkgs }, { data: pkgActions }, { data: userActions }] = await Promise.all([
    admin.from("packages").select("id, name, start_date, delivery_time").in("id", pkgIds),
    admin
      .from("package_actions")
      .select("package_id, action_id, week_number, delivery_date, delivery_time")
      .in("package_id", pkgIds),
    admin.from("user_actions").select("action_id").eq("user_id", userId),
  ]);

  const alreadyTaken = new Set<string>((userActions ?? []).map((ua: any) => ua.action_id as string));

  const pkgById = new Map<string, any>((pkgs ?? []).map((p: any) => [p.id as string, p]));
  const actionsByPkg = new Map<string, any[]>();
  for (const row of (pkgActions ?? []) as any[]) {
    const arr = actionsByPkg.get(row.package_id) ?? [];
    arr.push(row);
    actionsByPkg.set(row.package_id, arr);
  }

  const activatedActionIds: string[] = [];
  for (const a of assignments as any[]) {
    const pkg = pkgById.get(a.package_id);
    if (!pkg) continue;
    const rows = actionsByPkg.get(a.package_id) ?? [];
    for (const row of rows) {
      let effectiveDate: string | null = row.delivery_date;
      if (!effectiveDate) {
        const baseDate = a.scheduled_start_date ?? pkg.start_date;
        if (!baseDate) continue;
        const weekIndex = Math.max((row.week_number ?? 1) - 1, 0);
        const computed = addDaysToDate(baseDate, weekIndex * 7);
        if (!computed) continue;
        effectiveDate = computed;
      }

      const timePartUTC = row.delivery_time ?? pkg.delivery_time ?? "03:30:00";
      const activation = activationDateUTC(effectiveDate, timePartUTC);
      if (!activation) continue;
      const activationMs = activation.getTime();
      if (now >= activationMs + ONE_MINUTE_MS) {
        const id = row.action_id as string;
        if (!alreadyTaken.has(id)) activatedActionIds.push(id);
      }
    }
  }

  const unique = [...new Set(activatedActionIds)].slice(0, Math.max(limit, 0));
  if (!unique.length) return [];

  const { data: actions } = await admin
    .from("actions")
    .select("id, theme, title, how, why, time_estimate")
    .in("id", unique)
    .eq("company_id", companyId);

  const byId = new Map<string, any>((actions ?? []).map((r: any) => [r.id as string, r]));
  return unique
    .map((id) => byId.get(id))
    .filter(Boolean)
    .slice(0, limit)
    .map((r: any) => ({
      theme: r.theme,
      what: r.title,
      how: r.how,
      why: r.why,
      time: r.time_estimate ?? "5 mins",
    }));
}

export async function buildWeeklyEmailTemplateDataForUser(
  userId: string,
  {
    baseUrl,
    companyLogoUrl,
  }: { baseUrl: string; companyLogoUrl?: string }
): Promise<WeeklyEmailTemplateData> {
  const admin = createAdminClient();

  const { data: prof } = await admin
    .from("profiles")
    .select("full_name, company_id, total_points, league_index, streak")
    .eq("id", userId)
    .single();

  const fullName = (prof as any)?.full_name as string | null | undefined;
  const firstName = (fullName ?? "").trim().split(/\s+/)[0] || undefined;
  const companyId = (prof as any)?.company_id as string | null | undefined;
  const score = ((prof as any)?.total_points ?? 0) as number;
  const league = leagueFromIndex((prof as any)?.league_index as number | null | undefined);
  const streak = ((prof as any)?.streak ?? 0) as number;

  let companyName: string | undefined = undefined;
  if (companyId) {
    const { data: c } = await admin.from("companies").select("name").eq("id", companyId).single();
    companyName = (c as any)?.name as string | undefined;
  }

  let rank: number | string = "—";
  if (companyId) {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gt("total_points", score);
    if (typeof count === "number") rank = count + 1;
  }

  const actions = await getAvailableActionsForUser(userId, 3);

  return {
    company_logo: companyLogoUrl ?? `${baseUrl}/icon.png`,
    company_name: companyName,
    first_name: firstName,
    actions,
    rank,
    status: streak > 0 ? `${streak} day streak` : "Getting started",
    league,
    score,
  };
}

