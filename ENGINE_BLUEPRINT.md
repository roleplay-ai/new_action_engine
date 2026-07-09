# Nudgeable Action Engine: Technical Blueprint

## I. Product Philosophy & Role
**Role:** You are the **Nudgeable Action Engine**, a behavioral science platform designed to bridge the "Knowing-Doing Gap." You convert theoretical training into measurable, on-the-job micro-actions and cemented habits.

### Core Principles:
1. **Behavioral over Theoretical:** We prioritize small, repeatable actions over passive learning.
2. **Neo-Brutalist Clarity:** The UI is bold, high-contrast, and unambiguous to reflect the directness of the coaching.
3. **The Rep Loop:** Success isn't one-time; it's a series of "reps" that lead to "cementing" a habit.
4. **Social Proof:** Collective momentum through the Nudgeboard drives individual accountability.

---

## II. Implementation Specification (The Production Migration)

To move this engine to a production-grade stack, the following architecture is proposed:

### 1. Stack Foundation
- **Frontend:** Next.js 15 (App Router) for Server-Side Rendering (SSR) and optimized performance.
- **Language:** TypeScript for strict type safety across the behavior engine.
- **Backend/Database:** Supabase (PostgreSQL) for real-time data sync, authentication, and Row-Level Security (RLS).
- **Styling:** Tailwind CSS with a "Neo-Brutalist" design system.

### 2. Core Modules
- **Authentication:** Supabase Auth for JWT-based session management.
- **Action Lifecycle:**
    - `Discovery`: Browsing the Action Library.
    - `Intention`: Scheduling an action (State: `scheduled`).
    - `Execution`: Marking an action as complete (State: `success`).
    - `Habit Loop`: Triggering a multi-rep sequence (State: `habit_started`).
    - `Cementing`: Reaching the threshold (e.g., 5 reps) to turn action into trait (State: `cemented`).
- **Real-time Nudgeboard:** Utilizing Supabase Realtime Broadcast to show live team wins without page refreshes.

---

## III. Database Schema (PostgreSQL)

This schema is designed to support multi-tenancy, progress tracking, and social interactions.

```sql
-- Enable Realtime for the Feed
alter publication supabase_realtime add table feed_events;

-- 1. Profiles (Extends Supabase Auth)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  avatar_url TEXT,
  league_index INTEGER DEFAULT 0, -- From onboarding (league index 0–4)
  weekly_goal INTEGER DEFAULT 3,      -- Actions per week goal
  total_points INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Action Library (Master Data)
CREATE TYPE action_theme AS ENUM ('Collaboration', 'Feedback', 'Accountability', 'Connection', 'Coaching');

CREATE TABLE actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID REFERENCES profiles(id), -- Null for system-provided actions
  theme action_theme NOT NULL,
  title TEXT NOT NULL,
  how TEXT NOT NULL,
  why TEXT NOT NULL,
  points INTEGER DEFAULT 5,
  time_estimate TEXT DEFAULT '5 mins',
  is_system_action BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. User Actions (The Behavioral Ledger)
CREATE TYPE action_status AS ENUM ('scheduled', 'success', 'failed', 'skipped', 'habit_started', 'cemented');

CREATE TABLE user_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  action_id UUID REFERENCES actions(id) ON DELETE CASCADE NOT NULL,
  status action_status DEFAULT 'scheduled',
  scheduled_at TIMESTAMP WITH TIME ZONE,
  completed_reps INTEGER DEFAULT 0,
  reps_remaining INTEGER, -- Required reps to cement habit
  reflection TEXT,         -- Post-action impact notes
  is_calendar_synced BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, action_id)
);

-- 4. Social Feed Events
CREATE TYPE event_type AS ENUM ('ACCEPTED', 'SUCCESS', 'HABIT_STARTED', 'CEMENTED', 'DECLINED');

CREATE TABLE feed_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  action_title TEXT NOT NULL,
  type event_type NOT NULL,
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## IV. Behavioral Logic & Gamification

### Point Values (XP):
- **Accept Action:** 3 XP
- **Calendar Sync:** +2 XP (Encourages commitment)
- **Successful Validation:** 5 XP
- **Start Habit Loop:** 7 XP
- **Cemented Habit:** 10 XP
- **Honesty Skip:** 1 XP (Encourages interaction even if not acting)
- **Inaction/Failure:** -1 XP (Soft accountability)

### The League System:
- **Starter:** 0 - 24 XP
- **Bronze:** 25 - 49 XP
- **Silver:** 50 - 99 XP
- **Gold:** 100 - 199 XP
- **Diamond:** 200+ XP

---

## V. Implementation Steps

1. **Phase 1: Foundation (Week 1)**
   - Setup Next.js 15 project.
   - Configure Supabase project & execute SQL Schema.
   - Implement Auth and Profile creation.

2. **Phase 2: The Action Engine (Week 2)**
   - Build the Action Library browser.
   - Implement Server Actions for planning and validating actions.
   - Logic for "Habit Loops" (Rep triggers in PostgreSQL).

3. **Phase 3: The Social Layer (Week 3)**
   - Real-time Nudgeboard integration.
   - Leaderboard dynamic calculation (Postgres Views).
   - "Team Pulse" analytics dashboard.

4. **Phase 4: Admin & Insights (Week 4)**
   - "Architect Suite" for creating custom Action Packages.
   - Exportable behavioral impact reports.
   - Global benchmarking metrics.
