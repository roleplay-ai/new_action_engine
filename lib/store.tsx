"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { UserProfile, UserAction, FeedItem, ActionCard } from "./types";
import {
  declineAction as declineActionServer,
  completeAction as completeActionServer,
} from "@/app/actions/user-actions";
import { validateAction as validateActionServer } from "@/app/actions/validate-action";
import { syncMyTotalPointsFromHistory } from "@/app/actions/points";
import { getActiveGenerationJob } from "@/app/actions/ai-actions";
import { utcToISTDateTime } from "@/lib/timezone-utils";

export type GenerationJobStatus = {
  totalNeeded: number;
  totalGenerated: number;
  status: string;
};

interface EngineContextType {
  profile: UserProfile;
  userActions: UserAction[];
  allActions: ActionCard[];
  /** Null until the user completes the self-serve AI action onboarding wizard. */
  selfOnboardingCompletedAt: string | null;
  /** The current user's cohort (first one, if any), for Prepare/Action Plan/Progress pages. */
  cohort: { id: string; name: string; memberCount: number } | null;
  feed: FeedItem[];
  isLoading: boolean;
  hasCompany: boolean;
  /** Live progress of the background action-plan generation job, while one is running. */
  generationJob: GenerationJobStatus | null;
  refetch: () => Promise<void>;
  completeOnboarding: (importance: number, goal: number) => Promise<void>;
  updatePoints: (amount: number) => Promise<void>;
  completeAction: (actionId: string, success: boolean, reflection?: string) => Promise<{ error?: string }>;
  declineAction: (actionId: string) => Promise<void>;
  retryAction: (actionId: string) => Promise<void>;
  validateAction: (userActionId: string, success: boolean, reflection?: string) => Promise<void>;
  addFeedItem: (type: FeedItem["type"], actionTitle: string) => Promise<void>;
  likeFeedItem: (id: string) => Promise<void>;
  addNewAction: (action: Omit<ActionCard, "id">) => Promise<void>;
}

const EngineContext = createContext<EngineContextType | undefined>(undefined);

function mapDbAction(row: { id: string; theme: string; title: string; how: string; why: string; time_estimate: string; is_personal?: boolean | null }): ActionCard {
  return {
    id: row.id,
    theme: row.theme as ActionCard["theme"],
    title: row.title,
    how: row.how,
    why: row.why,
    timeEstimate: row.time_estimate ?? "5 mins",
    isPersonal: row.is_personal ?? false,
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
  const [selfOnboardingCompletedAt, setSelfOnboardingCompletedAt] = useState<string | null>(null);
  const [cohort, setCohort] = useState<{ id: string; name: string; memberCount: number } | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [hasCompany, setHasCompany] = useState(false);
  const [generationJob, setGenerationJob] = useState<GenerationJobStatus | null>(null);
  const generationWasActive = useRef(false);

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

    // Best-effort: cohort tables are newer (migration 025) — isolated so a
    // not-yet-migrated DB doesn't break the core profile fetch above.
    const { data: myCohortMembership } = await supabase
      .from("cohort_members")
      .select("cohort_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (myCohortMembership?.cohort_id) {
      const { data: cohortRow } = await supabase
        .from("cohorts")
        .select("id, name")
        .eq("id", myCohortMembership.cohort_id)
        .single();
      const { count: memberCount } = await supabase
        .from("cohort_members")
        .select("id", { count: "exact", head: true })
        .eq("cohort_id", myCohortMembership.cohort_id);
      setCohort(
        cohortRow ? { id: cohortRow.id, name: cohortRow.name, memberCount: memberCount ?? 0 } : null
      );
    } else {
      setCohort(null);
    }

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
        .select("id, theme, title, how, why, time_estimate, is_personal")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true });
      setAllActions((actions ?? []).map(mapDbAction));
    } else {
      setAllActions([]);
    }

    const { data: uas } = await supabase
      .from("user_actions")
      .select("*")
      .eq("user_id", user.id);
    setUserActions((uas ?? []).map(mapDbUserAction));

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

  // Poll for background action-plan generation progress. Only surfaces the job
  // while it's actively generating — the bell badge disappears on its own once
  // it completes or fails. Also re-pulls allActions/userActions while a job is
  // running so newly generated actions show up in the library live, not just
  // the progress counter.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const { job } = await getActiveGenerationJob();
      if (cancelled) return;
      const isGenerating = job?.status === "generating";
      setGenerationJob(isGenerating ? job : null);
      if (isGenerating) {
        generationWasActive.current = true;
        await refetch();
      } else if (generationWasActive.current) {
        generationWasActive.current = false;
        await refetch();
      }
    };
    poll();
    const interval = setInterval(poll, 6000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refetch]);

  const updatePoints = async () => { };
  const addFeedItem = async () => { };
  const completeOnboarding = async () => { };
  const likeFeedItem = async () => { };
  const addNewAction = async (_action: Omit<import("./types").ActionCard, "id">) => {
    // Implemented in AdminDashboard via createAction server action
  };

  const completeAction = async (actionId: string, success: boolean, reflection?: string) => {
    const result = await completeActionServer({ actionId, success, reflection });
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
      selfOnboardingCompletedAt,
      cohort,
      feed,
      isLoading,
      hasCompany,
      generationJob,
      refetch,
      completeOnboarding,
      updatePoints,
      completeAction,
      declineAction,
      retryAction,
      validateAction,
      addFeedItem,
      likeFeedItem,
      addNewAction,
    }),
    [profile, userActions, allActions, selfOnboardingCompletedAt, cohort, feed, isLoading, hasCompany, generationJob, refetch]
  );

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
};

export const useEngine = () => {
  const context = useContext(EngineContext);
  if (!context) throw new Error("useEngine must be used within EngineProvider");
  return context;
};
