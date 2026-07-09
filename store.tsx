
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { UserProfile, UserAction, FeedItem, ActionCard } from './types.ts';
import { POINT_VALUES, ACTION_DECK } from './constants.tsx';

// Note: In a real Next.js/Supabase app, these would be Server Actions
interface EngineContextType {
  profile: UserProfile;
  userActions: UserAction[];
  allActions: ActionCard[];
  feed: FeedItem[];
  isLoading: boolean;
  completeOnboarding: (importance: number, goal: number) => Promise<void>;
  updatePoints: (amount: number) => Promise<void>;
  acceptAction: (actionId: string, day: string, time: string, sync: boolean) => Promise<void>;
  declineAction: (actionId: string) => Promise<void>;
  retryAction: (actionId: string) => Promise<void>;
  markHabit: (userActionId: string) => Promise<void>;
  validateAction: (userActionId: string, success: boolean, reflection?: string) => Promise<void>;
  addFeedItem: (type: FeedItem['type'], actionTitle: string) => Promise<void>;
  likeFeedItem: (id: string) => Promise<void>;
  addNewAction: (action: Omit<ActionCard, 'id'>) => Promise<void>;
}

const EngineContext = createContext<EngineContextType | undefined>(undefined);

export const EngineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // This legacy client-only store now keeps everything in memory only.
  // All production flows use the DB-backed implementation in `lib/store.tsx`.
  const [isLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({
    name: 'Gaurav',
    importanceRating: 10,
    weeklyGoal: 3,
    totalPoints: 28,
    onboarded: true,
    streak: 1
  });

  const [customActions, setCustomActions] = useState<ActionCard[]>([]);
  const allActions = useMemo(() => [...ACTION_DECK, ...customActions], [customActions]);
  const [userActions, setUserActions] = useState<UserAction[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);

  const updatePoints = async (amount: number) => {
    setProfile(prev => ({ ...prev, totalPoints: Math.max(0, prev.totalPoints + amount) }));
  };

  const addFeedItem = async (type: FeedItem['type'], actionTitle: string) => {
    const newItem: FeedItem = {
      id: Math.random().toString(36).substr(2, 9),
      userId: 'me',
      userName: profile.name,
      actionTitle,
      type,
      timestamp: Date.now(),
      likes: 0
    };
    setFeed(prev => [newItem, ...prev].slice(0, 50));
  };

  const completeOnboarding = async (importance: number, goal: number) => {
    setProfile(prev => ({ ...prev, importanceRating: importance, weeklyGoal: goal, onboarded: true }));
  };

  const acceptAction = async (actionId: string, day: string, time: string, sync: boolean) => {
    const action = allActions.find(a => a.id === actionId);
    if (!action) return;

    setUserActions(prev => {
      const existing = prev.find(ua => ua.actionId === actionId);
      if (existing) {
        return prev.map(ua => ua.actionId === actionId ? {
          ...ua,
          status: 'scheduled',
          scheduledDate: day,
          scheduledTime: time,
          isCalendarSynced: sync
        } : ua);
      }
      return [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        actionId,
        status: 'scheduled',
        scheduledDate: day,
        scheduledTime: time,
        isCalendarSynced: sync,
        completedReps: 0
      }];
    });

    await addFeedItem('ACCEPTED', action.title);
    await updatePoints(POINT_VALUES.ACCEPT + (sync ? POINT_VALUES.CALENDAR_SYNC : 0));
  };

  const declineAction = async (actionId: string) => {
    const action = allActions.find(a => a.id === actionId);
    if (!action) return;
    setUserActions(prev => {
      const existing = prev.find(ua => ua.actionId === actionId);
      if (existing) return prev.map(ua => ua.actionId === actionId ? { ...ua, status: 'skipped' } : ua);
      return [...prev, { id: Math.random().toString(36).substr(2, 9), actionId, status: 'skipped', completedReps: 0 }];
    });
    await updatePoints(POINT_VALUES.HONESTY_SKIP);
    await addFeedItem('DECLINED', action.title);
  };

  const retryAction = async (actionId: string) => {
    setUserActions(prev => prev.filter(ua => ua.actionId !== actionId));
  };

  const markHabit = async (userActionId: string) => {
    setUserActions(prev => prev.map(ua => {
      if (ua.id === userActionId) {
        const action = allActions.find(a => a.id === ua.actionId);
        if (action) addFeedItem('HABIT_STARTED', action.title);
        updatePoints(POINT_VALUES.START_HABIT);
        return { ...ua, status: 'habit_started', habitRepsRemaining: 4 };
      }
      return ua;
    }));
  };

  const validateAction = async (userActionId: string, success: boolean, reflection?: string) => {
    setUserActions(prev => prev.map(ua => {
      if (ua.id === userActionId) {
        const action = allActions.find(a => a.id === ua.actionId);
        if (!action) return ua;

        if (success) {
          updatePoints(POINT_VALUES.SUCCESS);
          const isHabit = ua.status === 'habit_started';
          const newRepsRemaining = isHabit ? (ua.habitRepsRemaining || 0) - 1 : 0;
          const isCemented = isHabit && newRepsRemaining <= 0;

          addFeedItem(isCemented ? 'CEMENTED' : 'SUCCESS', action.title);
          if (isCemented) updatePoints(POINT_VALUES.CEMENTED_HABIT);

          return {
            ...ua,
            status: isCemented ? 'cemented' : (isHabit ? 'habit_started' : 'success'),
            reflection,
            completedReps: ua.completedReps + 1,
            habitRepsRemaining: isHabit ? newRepsRemaining : undefined
          };
        } else {
          updatePoints(POINT_VALUES.INACTION_DEDUCTION);
          return { ...ua, status: 'failed' };
        }
      }
      return ua;
    }));
  };

  const likeFeedItem = async (id: string) => {
    setFeed(prev => prev.map(item => item.id === id ? { ...item, likes: item.likes + 1 } : item));
  };

  const addNewAction = async (action: Omit<ActionCard, 'id'>) => {
    const newAction: ActionCard = {
      ...action,
      id: 'custom-' + Math.random().toString(36).substr(2, 9)
    };
    setCustomActions(prev => [...prev, newAction]);
  };

  return (
    <EngineContext.Provider value={{
      profile, userActions, allActions, feed, isLoading,
      completeOnboarding, updatePoints, acceptAction, declineAction, retryAction,
      markHabit, validateAction, addFeedItem, likeFeedItem, addNewAction
    }}>
      {children}
    </EngineContext.Provider>
  );
};

export const useEngine = () => {
  const context = useContext(EngineContext);
  if (!context) throw new Error('useEngine must be used within EngineProvider');
  return context;
};
