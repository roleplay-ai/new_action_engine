
export type ActionTheme = 'Collaboration' | 'Feedback' | 'Accountability' | 'Connection' | 'Coaching';

export interface ActionCard {
  id: string;
  theme: ActionTheme;
  title: string;
  how: string;
  why: string;
  points: number;
  timeEstimate: string;
}

export interface UserAction {
  id: string;
  actionId: string;
  status: 'pending' | 'scheduled' | 'success' | 'failed' | 'skipped' | 'habit_started' | 'cemented';
  scheduledDate?: string;
  scheduledTime?: string;
  isCalendarSynced?: boolean;
  habitRepsRemaining?: number;
  completedReps: number;
  reflection?: string;
}

export interface FeedItem {
  id: string;
  userId: string;
  userName: string;
  actionTitle: string;
  type: 'READ' | 'ACCEPTED' | 'SCHEDULED' | 'DECLINED' | 'SUCCESS' | 'HABIT_STARTED' | 'CEMENTED';
  timestamp: number;
  likes: number;
}

export interface UserProfile {
  name: string;
  importanceRating: number;
  weeklyGoal: number;
  totalPoints: number;
  onboarded: boolean;
  streak: number;
}

export enum League {
  Starter = 'Starter',
  Bronze = 'Bronze',
  Silver = 'Silver',
  Gold = 'Gold',
  Diamond = 'Diamond'
}
