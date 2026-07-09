"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { UserProfile, UserAction, FeedItem, ActionCard } from "./types";
import {
  scheduleAction as scheduleActionServer,
  declineAction as declineActionServer,
  acceptActionWithoutSchedule as acceptActionWithoutScheduleServer,
} from "@/app/actions/user-actions";
import { validateAction as validateActionServer } from "@/app/actions/validate-action";
import { syncMyTotalPointsFromHistory } from "@/app/actions/points";
import { utcToISTDateTime, utcToISTTime, IST_OFFSET_MINUTES } from "@/lib/timezone-utils";

/** Normalise time string from DB (e.g. "14:30", "14:30:00", "14:30:00.123") to HH:MM:SS. */
function normaliseTimeString(timePart: string | null | undefined): string {
  if (timePart == null || typeof timePart !== "string") return "09:00:00";
  const s = timePart.trim();
  if (!s) return "09:00:00";
  const parts = s.split(":");
  const hour = parts[0] ?? "09";
  const minute = parts[1] ?? "00";
  const second = (parts[2] ?? "00").replace(/\D/g, "").slice(0, 2) || "00";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${second.padStart(2, "0")}`;
}

/** 
 * Build activation Date in UTC from date + time (already in UTC from database).
 * The baseDate is in local date, timePartUTC is UTC time from database.
 * We need to combine them properly for activation checking.
 */
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
  
  // Create UTC date with the given date and UTC time
  const d = new Date(Date.UTC(year, month - 1, day, hourUTC, minuteUTC, secondUTC));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Add N days to a YYYY-MM-DD date string, returning a new YYYY-MM-DD (UTC-based). */
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

interface EngineContextType {
  profile: UserProfile;
  userActions: UserAction[];
  allActions: ActionCard[];
  /** Action IDs that are in a package assigned to the user but not yet activated (IST). */
  actionIdsInFuturePackages: Set<string>;
  /** Action IDs that are in a package assigned to the user and already activated (IST). */
  actionIdsInAssignedPackages: Set<string>;
  /** Name of the first currently-active package assigned to the user. */
  assignedPackageName: string | null;
  /** Null until the user completes the self-serve AI action onboarding wizard. */
  selfOnboardingCompletedAt: string | null;
  feed: FeedItem[];
  isLoading: boolean;
  hasCompany: boolean;
  refetch: () => Promise<void>;
  completeOnboarding: (importance: number, goal: number) => Promise<void>;
  updatePoints: (amount: number) => Promise<void>;
  acceptAction: (actionId: string, date: string, time: string, sync: boolean) => Promise<{ error?: string }>;
  acceptActionWithoutSchedule: (actionId: string) => Promise<{ error?: string }>;
  declineAction: (actionId: string) => Promise<void>;
  retryAction: (actionId: string) => Promise<void>;
  validateAction: (userActionId: string, success: boolean, reflection?: string) => Promise<void>;
  addFeedItem: (type: FeedItem["type"], actionTitle: string) => Promise<void>;
  likeFeedItem: (id: string) => Promise<void>;
  addNewAction: (action: Omit<ActionCard, "id">) => Promise<void>;
}

const EngineContext = createContext<EngineContextType | undefined>(undefined);

function mapDbAction(row: { id: string; theme: string; title: string; how: string; why: string; time_estimate: string }): ActionCard {
  return {
    id: row.id,
    theme: row.theme as ActionCard["theme"],
    title: row.title,
    how: row.how,
    why: row.why,
    timeEstimate: row.time_estimate ?? "5 mins",
  };
}

function mapDbUserAction(row: {
  id: string;
  action_id: string;
  status: string;
  scheduled_at: string | null;
  accepted_at: string | null;
  reflection: string | null;
  is_calendar_synced: boolean;
}): UserAction {
  // Convert UTC timestamps to IST for display
  const scheduledIST = row.scheduled_at ? utcToISTDateTime(row.scheduled_at) : null;
  const acceptedIST = row.accepted_at ? utcToISTDateTime(row.accepted_at) : null;

  return {
    id: row.id,
    actionId: row.action_id,
    status: row.status as UserAction["status"],
    scheduledDate: scheduledIST?.date,
    scheduledTime: scheduledIST?.time,
    scheduledAt: row.scheduled_at ?? undefined,
    acceptedAt: row.accepted_at ?? undefined,
    acceptedDate: acceptedIST?.date,
    acceptedTime: acceptedIST?.time,
    isCalendarSynced: row.is_calendar_synced ?? false,
    reflection: row.reflection ?? undefined,
  };
}

function mapDbFeedEvent(row: { id: string; user_id: string; action_title: string; type: string; likes: number; created_at: string }): FeedItem {
  return {
    id: row.id,
    userId: row.user_id,
    userName: "",
    actionTitle: row.action_title,
    type: row.type as FeedItem["type"],
    timestamp: new Date(row.created_at).getTime(),
    likes: row.likes ?? 0,
  };
}

export const EngineProvider: React.FC<{ children: React.ReactNode; adminCompanyId?: string | null }> = ({ children, adminCompanyId }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile>({
    name: "User",
    importanceRating: 5,
    weeklyGoal: 3,
    totalPoints: 0,
    onboarded: true,
    streak: 0,
  });
  const [allActions, setAllActions] = useState<ActionCard[]>([]);
  const [userActions, setUserActions] = useState<UserAction[]>([]);
  const [actionIdsInFuturePackages, setActionIdsInFuturePackages] = useState<Set<string>>(new Set());
  const [actionIdsInAssignedPackages, setActionIdsInAssignedPackages] = useState<Set<string>>(new Set());
  const [assignedPackageName, setAssignedPackageName] = useState<string | null>(null);
  const [selfOnboardingCompletedAt, setSelfOnboardingCompletedAt] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [hasCompany, setHasCompany] = useState(false);

  const refetch = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setIsLoading(false);
      return;
    }

    // Backfill/sync points from existing history so legacy users get correct totals.
    await syncMyTotalPointsFromHistory();

    const { data: prof } = await supabase
      .from("profiles")
      .select("full_name, total_points, weekly_goal, league_index, streak")
      .eq("id", user.id)
      .single();
    if (prof) {
      setProfile({
        name: prof.full_name?.trim() || user.email?.split("@")[0] || "User",
        importanceRating: (prof as any).league_index ?? 0,
        weeklyGoal: prof.weekly_goal ?? 3,
        totalPoints: prof.total_points ?? 0,
        onboarded: true,
        streak: prof.streak ?? 0,
      });
    }

    // Separate, best-effort query: self_onboarding_completed_at is a newer column
    // (migration 021) — kept isolated so a not-yet-migrated DB doesn't break the
    // core profile fetch above.
    const { data: onboardingRow } = await supabase
      .from("profiles")
      .select("self_onboarding_completed_at")
      .eq("id", user.id)
      .maybeSingle();
    setSelfOnboardingCompletedAt((onboardingRow as any)?.self_onboarding_completed_at ?? null);

    const { data: profRow } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();
    const companyId = adminCompanyId ?? profRow?.company_id;
    setHasCompany(!!companyId);
    if (companyId) {
      const { data: actions } = await supabase
        .from("actions")
        .select("id, theme, title, how, why, time_estimate")
        .eq("company_id", companyId);
      setAllActions((actions ?? []).map(mapDbAction));
    } else {
      setAllActions([]);
    }

    const { data: uas } = await supabase
      .from("user_actions")
      .select("*")
      .eq("user_id", user.id);
    setUserActions((uas ?? []).map(mapDbUserAction));

    const futureIds = new Set<string>();
    const assignedIds = new Set<string>();
    let firstActivePkgName: string | null = null;
    const { data: assignments } = await supabase
      .from("package_assignments")
      .select("package_id, scheduled_start_date")
      .eq("user_id", user.id);
    if (assignments?.length) {
      const pkgIds = [...new Set(assignments.map((a: { package_id: string }) => a.package_id))];
      const { data: pkgs } = await supabase
        .from("packages")
        .select("id, name, start_date, delivery_time")
        .in("id", pkgIds);
      // Fetch package actions with UTC dates/times from database
      const { data: pkgActions } = await supabase
        .from("package_actions")
        .select("package_id, action_id, week_number, delivery_date, delivery_time")
        .in("package_id", pkgIds);
      const pkgById = new Map(
        (pkgs ?? []).map(
          (p: { id: string; name: string | null; start_date: string | null; delivery_time: string | null }) => [p.id, p]
        )
      );
      type PkgActionRow = {
        package_id: string;
        action_id: string;
        week_number: number | null;
        delivery_date: string | null;
        delivery_time: string | null;
      };
      const actionsByPkg = new Map<string, PkgActionRow[]>();
      for (const row of (pkgActions ?? []) as PkgActionRow[]) {
        const arr = actionsByPkg.get(row.package_id) ?? [];
        arr.push(row);
        actionsByPkg.set(row.package_id, arr);
      }
      const now = Date.now();
      // Only show package actions after scheduled time: require at least 1 minute past activation (IST) to avoid showing before time
      const ONE_MINUTE_MS = 60 * 1000;
      for (const a of assignments as { package_id: string; scheduled_start_date: string | null }[]) {
        const pkg = pkgById.get(a.package_id) as
          | { name: string | null; start_date: string | null; delivery_time: string | null }
          | undefined;
        if (!pkg) continue;
        const rows = actionsByPkg.get(a.package_id) ?? [];
        if (!rows.length) continue;

        for (const row of rows) {
          // Determine the effective delivery date for this action:
          // 1) Prefer explicit delivery_date set by admin per delivery/week.
          // 2) Fallback: base start date (assignment override or package start)
          //    plus 7-day steps per week_number (1-based).
          let effectiveDate = row.delivery_date;
          if (!effectiveDate) {
            const baseDate = a.scheduled_start_date ?? pkg.start_date;
            if (!baseDate) continue;
            const weekIndex = Math.max((row.week_number ?? 1) - 1, 0);
            const computed = addDaysToDate(baseDate, weekIndex * 7);
            if (!computed) continue;
            effectiveDate = computed;
          }

          // Determine effective time (UTC from database):
          // 1) Prefer per-delivery time on package_actions.
          // 2) Fallback to package-level activation time (packages.delivery_time).
          // Both are stored in UTC in the database.
          const timePartUTC = row.delivery_time ?? pkg.delivery_time ?? "03:30:00"; // Default: 09:00 IST = 03:30 UTC

          const activation = activationDateUTC(effectiveDate, timePartUTC);
          if (!activation) continue;
          const activationMs = activation.getTime();
          if (activationMs > now) {
            futureIds.add(row.action_id);
          } else if (now >= activationMs + ONE_MINUTE_MS) {
            assignedIds.add(row.action_id);
            if (firstActivePkgName === null && pkg?.name) {
              firstActivePkgName = pkg.name;
            }
          }
        }
      }
    }
    setActionIdsInFuturePackages(futureIds);
    setActionIdsInAssignedPackages(assignedIds);
    setAssignedPackageName(firstActivePkgName);

    const { data: events } = await supabase
      .from("feed_events")
      .select("id, user_id, action_title, type, likes, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    const displayName = prof?.full_name?.trim() || user.email?.split("@")[0] || "User";
    const items = (events ?? []).map((e) => {
      const it = mapDbFeedEvent(e);
      it.userName = it.userId === user.id ? displayName : "User";
      return it;
    });
    setFeed(items);
  }, [adminCompanyId]);

  useEffect(() => {
    refetch().finally(() => setIsLoading(false));
  }, [refetch, adminCompanyId]);

  const updatePoints = async () => { };
  const addFeedItem = async () => { };
  const completeOnboarding = async () => { };
  const likeFeedItem = async () => { };
  const addNewAction = async (_action: Omit<import("./types").ActionCard, "id">) => {
    // Implemented in AdminDashboard via createAction server action
  };

  const acceptAction = async (actionId: string, date: string, time: string, sync: boolean) => {
    const result = await scheduleActionServer({ actionId, day: date, time, sync });
    if (result.error) return { error: result.error };

    await refetch();
    return {};
  };

  const acceptActionWithoutSchedule = async (actionId: string) => {
    const result = await acceptActionWithoutScheduleServer(actionId);
    if (!result.error) await refetch();
    return result;
  };

  const declineAction = async (actionId: string) => {
    const { error } = await declineActionServer(actionId);
    if (!error) await refetch();
  };

  const retryAction = async () => { };

  const validateAction = async (userActionId: string, success: boolean, reflection?: string) => {
    const { error } = await validateActionServer(userActionId, success, reflection);
    if (!error) await refetch();
  };

  const value = useMemo(
    () => ({
      profile,
      userActions,
      allActions,
      actionIdsInFuturePackages,
      actionIdsInAssignedPackages,
      assignedPackageName,
      selfOnboardingCompletedAt,
      feed,
      isLoading,
      hasCompany,
      refetch,
      completeOnboarding,
      updatePoints,
      acceptAction,
      acceptActionWithoutSchedule,
      declineAction,
      retryAction,
      validateAction,
      addFeedItem,
      likeFeedItem,
      addNewAction,
    }),
    [profile, userActions, allActions, actionIdsInFuturePackages, actionIdsInAssignedPackages, selfOnboardingCompletedAt, feed, isLoading, hasCompany, refetch]
  );

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
};

export const useEngine = () => {
  const context = useContext(EngineContext);
  if (!context) throw new Error("useEngine must be used within EngineProvider");
  return context;
};
