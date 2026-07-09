-- Nudgeable Action Engine: Base schema (Phase 0) – multi-tenant
-- Run in Supabase SQL Editor or via supabase db push

-- 1. Companies first (profiles and actions reference them)
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Profiles (extends Supabase Auth); company_id and role for multi-tenant
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  avatar_url TEXT,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'superadmin')),
  -- For user roles, league_index stores league index: 0=Starter,1=Bronze,2=Silver,3=Gold,4=Diamond
  league_index INTEGER DEFAULT 0,
  weekly_goal INTEGER DEFAULT 3,
  total_points INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Action Library (company-scoped)
CREATE TYPE action_theme AS ENUM ('Collaboration', 'Feedback', 'Accountability', 'Connection', 'Coaching');

CREATE TABLE IF NOT EXISTS public.actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id),
  theme action_theme NOT NULL,
  title TEXT NOT NULL,
  how TEXT NOT NULL,
  why TEXT NOT NULL,
  points INTEGER DEFAULT 5,
  time_estimate TEXT DEFAULT '5 mins',
  is_system_action BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. User Actions (behavioral ledger)
CREATE TYPE action_status AS ENUM ('scheduled', 'success', 'failed', 'skipped', 'habit_started', 'cemented');

CREATE TABLE IF NOT EXISTS public.user_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  action_id UUID REFERENCES public.actions(id) ON DELETE CASCADE NOT NULL,
  status action_status DEFAULT 'scheduled',
  scheduled_at TIMESTAMPTZ,
  completed_reps INTEGER DEFAULT 0,
  reps_remaining INTEGER,
  reflection TEXT,
  is_calendar_synced BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, action_id)
);

-- 5. Social Feed Events
CREATE TYPE event_type AS ENUM ('ACCEPTED', 'SUCCESS', 'HABIT_STARTED', 'CEMENTED', 'DECLINED');

CREATE TABLE IF NOT EXISTS public.feed_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  action_title TEXT NOT NULL,
  type event_type NOT NULL,
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Realtime for feed
ALTER PUBLICATION supabase_realtime ADD TABLE public.feed_events;

-- RLS: enable on all tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_events ENABLE ROW LEVEL SECURITY;

-- Companies: superadmin full access; company admin and user read own company
CREATE POLICY "Superadmin full companies" ON public.companies
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );
CREATE POLICY "Read own company" ON public.companies
  FOR SELECT USING (
    id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND company_id IS NOT NULL)
  );

-- Profiles: read/update own; superadmin can update any; company admin can read profiles in their company
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Superadmin update any profile" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin')
  );
CREATE POLICY "Company admin read company profiles" ON public.profiles
  FOR SELECT USING (
    company_id IS NOT NULL
    AND company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin') LIMIT 1)
  );
CREATE POLICY "Service or trigger insert profile" ON public.profiles FOR INSERT WITH CHECK (true);

-- Actions: read where action.company_id = user's company_id; insert/update/delete by company admin for that company or superadmin
CREATE POLICY "Read actions in my company" ON public.actions
  FOR SELECT USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );
CREATE POLICY "Company admin or superadmin insert actions" ON public.actions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (
      p.role = 'superadmin'
      OR (p.role = 'admin' AND p.company_id = company_id)
    ))
  );
CREATE POLICY "Company admin or superadmin update actions" ON public.actions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (
      p.role = 'superadmin'
      OR (p.role = 'admin' AND p.company_id = actions.company_id)
    ))
  );
CREATE POLICY "Company admin or superadmin delete actions" ON public.actions
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (
      p.role = 'superadmin'
      OR (p.role = 'admin' AND p.company_id = actions.company_id)
    ))
  );

-- User actions: CRUD own
CREATE POLICY "Users CRUD own user_actions" ON public.user_actions FOR ALL USING (auth.uid() = user_id);

-- Feed events: read all (filter by company in app); insert own
CREATE POLICY "Anyone read feed_events" ON public.feed_events FOR SELECT USING (true);
CREATE POLICY "Users insert own feed_events" ON public.feed_events FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Trigger: create profile on signup (company_id null, role 'user')
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, company_id, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    NULL,
    'user'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
