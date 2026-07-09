import { createAdminClient } from "@/lib/supabase/admin";
import { utcToISTTime } from "@/lib/timezone-utils";

export type ActionReminderEmailAction = {
  theme: string;
  what: string;
  how: string;
  why: string;
  timesPerWeek: number;
  timeOfDay: string;
};

export type ActionReminderEmailData = {
  company_logo?: string;
  company_name?: string;
  first_name?: string;
  actions: ActionReminderEmailAction[];
};

export type DueReminderRow = {
  id: string;
  user_id: string;
  action_id: string;
  times_per_week: number;
  time_of_day_utc: string;
  next_run_at: string;
};

/** Fetch all active reminders due at or before `nowIso`, grouped by user_id. */
export async function getDueRemindersByUser(
  nowIso: string
): Promise<Map<string, DueReminderRow[]>> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("action_reminders")
    .select("id, user_id, action_id, times_per_week, time_of_day_utc, next_run_at")
    .eq("is_active", true)
    .lte("next_run_at", nowIso);

  const byUser = new Map<string, DueReminderRow[]>();
  for (const row of (rows ?? []) as DueReminderRow[]) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }
  return byUser;
}

export async function buildActionReminderTemplateData(
  userId: string,
  dueRows: DueReminderRow[],
  { baseUrl, companyLogoUrl }: { baseUrl: string; companyLogoUrl?: string }
): Promise<ActionReminderEmailData> {
  const admin = createAdminClient();

  const { data: prof } = await admin
    .from("profiles")
    .select("full_name, company_id")
    .eq("id", userId)
    .single();

  const firstName = (prof?.full_name ?? "").trim().split(/\s+/)[0] || undefined;

  let companyName: string | undefined;
  if (prof?.company_id) {
    const { data: company } = await admin
      .from("companies")
      .select("name")
      .eq("id", prof.company_id)
      .maybeSingle();
    companyName = (company as any)?.name ?? undefined;
  }

  const actionIds = [...new Set(dueRows.map((r) => r.action_id))];
  const { data: actionRows } = await admin
    .from("actions")
    .select("id, theme, title, how, why")
    .in("id", actionIds);
  const actionById = new Map((actionRows ?? []).map((a: any) => [a.id, a]));

  const actions: ActionReminderEmailAction[] = dueRows
    .map((row) => {
      const action = actionById.get(row.action_id) as
        | { theme: string; title: string; how: string; why: string }
        | undefined;
      if (!action) return null;
      return {
        theme: action.theme,
        what: action.title,
        how: action.how,
        why: action.why,
        timesPerWeek: row.times_per_week,
        timeOfDay: utcToISTTime(row.time_of_day_utc),
      };
    })
    .filter((a): a is ActionReminderEmailAction => a !== null);

  return {
    company_logo: companyLogoUrl ?? `${baseUrl}/icon.png`,
    company_name: companyName,
    first_name: firstName,
    actions,
  };
}
