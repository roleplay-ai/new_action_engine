
export type ActionTheme = 'Collaboration' | 'Feedback' | 'Accountability' | 'Connection' | 'Coaching';

export interface ActionCard {
  id: string;
  theme: ActionTheme;
  title: string;
  how: string;
  why: string;
  timeEstimate: string;
}

export interface UserAction {
  id: string;
  actionId: string;
  status: 'scheduled' | 'success' | 'failed' | 'skipped';
  scheduledDate?: string;
  scheduledTime?: string;
  scheduledAt?: string; // ISO string for validation queue filter
  /** When user committed (with or without schedule). Used for "Accepted on xyz" in validation queue. */
  acceptedAt?: string;
  acceptedDate?: string;
  acceptedTime?: string;
  isCalendarSynced?: boolean;
  reflection?: string;
}

/** A user's weekly reminder cadence for one accepted action. */
export interface ActionReminder {
  id: string;
  userActionId: string;
  actionId: string;
  timesPerWeek: number;
  /** Intended time of day (IST, HH:MM) shown in the reminder email as display copy. */
  timeOfDayIST: string;
  isActive: boolean;
  lastSentAt?: string;
  /** True if the current ISO week (IST) has already been marked done. */
  doneThisWeek: boolean;
}

export interface FeedItem {
  id: string;
  userId: string;
  userName: string;
  actionTitle: string;
  type: 'READ' | 'ACCEPTED' | 'SCHEDULED' | 'DECLINED' | 'SUCCESS';
  timestamp: number;
  likes: number;
}

export interface UserProfile {
  name: string;
  /** League index (0–4) derived from profiles.league_index for DB-backed store; legacy clients may treat this as an importance slider. */
  importanceRating: number;
  weeklyGoal: number;
  totalPoints: number;
  onboarded: boolean;
  streak: number;
}

/** DB profile row (profiles table): multi-tenant company_id and role */
export interface DbProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  company_id: string | null;
  role: "user" | "admin" | "superadmin";
  /** For user roles, league index: 0=Starter,1=Bronze,2=Silver,3=Gold,4=Diamond. */
  league_index: number;
  weekly_goal: number;
  total_points: number;
  streak: number;
  last_active_at: string | null;
  created_at: string;
}

export enum League {
  Starter = 'Starter',
  Bronze = 'Bronze',
  Silver = 'Silver',
  Gold = 'Gold',
  Diamond = 'Diamond'
}
