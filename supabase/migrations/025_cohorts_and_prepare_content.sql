-- Cohorts (groups of users within a company sharing an action plan) and a
-- global, superadmin-authored "Prepare" content library (videos, quizzes,
-- pre-reads) that gets assigned per-cohort, plus per-user progress tracking.
--
-- A cohort "wraps" a package: packages.cohort_id links a package to a cohort,
-- and cohort membership changes drive package_assignments automatically
-- (application-side sync in app/actions/cohorts.ts, not a DB trigger — this
-- app computes activation/derived state in server actions rather than
-- triggers, see lib/store.tsx's client-side activation math for the same
-- convention). Everything here is additive/nullable so existing companies,
-- packages and users keep working untouched with zero cohorts in existence.
--
-- Every CREATE POLICY below is preceded by a DROP POLICY IF EXISTS so this
-- file can be safely re-run in full after a partial failure (matches the
-- idempotent CREATE TABLE/INDEX IF NOT EXISTS style already used elsewhere).

-- 1. Cohorts --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cohorts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id),
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cohorts_company ON public.cohorts(company_id);

COMMENT ON TABLE public.cohorts IS
  'A named group of users within a company (e.g. "Leadership Cohort - Jan 2026") that shares Prepare content and an action plan (via packages.cohort_id).';

CREATE TABLE IF NOT EXISTS public.cohort_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cohort_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cohort_members_cohort ON public.cohort_members(cohort_id);
CREATE INDEX IF NOT EXISTS idx_cohort_members_user ON public.cohort_members(user_id);

ALTER TABLE public.cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_members ENABLE ROW LEVEL SECURITY;

-- Cohorts: same company admin / superadmin quad as packages (006_packages.sql).
DROP POLICY IF EXISTS "Read cohorts in my company" ON public.cohorts;
CREATE POLICY "Read cohorts in my company" ON public.cohorts
  FOR SELECT USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );
DROP POLICY IF EXISTS "Admin insert cohorts" ON public.cohorts;
CREATE POLICY "Admin insert cohorts" ON public.cohorts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (
      p.role = 'superadmin'
      OR (p.role = 'admin' AND p.company_id = company_id)
    ))
  );
DROP POLICY IF EXISTS "Admin update cohorts" ON public.cohorts;
CREATE POLICY "Admin update cohorts" ON public.cohorts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (
      p.role = 'superadmin'
      OR (p.role = 'admin' AND p.company_id = cohorts.company_id)
    ))
  );
DROP POLICY IF EXISTS "Admin delete cohorts" ON public.cohorts;
CREATE POLICY "Admin delete cohorts" ON public.cohorts
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (
      p.role = 'superadmin'
      OR (p.role = 'admin' AND p.company_id = cohorts.company_id)
    ))
  );

-- Cohort members: readable by the member themselves (for their own roster
-- view) or the cohort's company admin/superadmin; writable by admin/superadmin only.
DROP POLICY IF EXISTS "Read cohort_members" ON public.cohort_members;
CREATE POLICY "Read cohort_members" ON public.cohort_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR cohort_id IN (
      SELECT c.id FROM public.cohorts c
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = c.company_id))
    )
  );
DROP POLICY IF EXISTS "Admin insert cohort_members" ON public.cohort_members;
CREATE POLICY "Admin insert cohort_members" ON public.cohort_members
  FOR INSERT WITH CHECK (
    cohort_id IN (
      SELECT c.id FROM public.cohorts c
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = c.company_id))
    )
  );
DROP POLICY IF EXISTS "Admin delete cohort_members" ON public.cohort_members;
CREATE POLICY "Admin delete cohort_members" ON public.cohort_members
  FOR DELETE USING (
    cohort_id IN (
      SELECT c.id FROM public.cohorts c
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = c.company_id))
    )
  );

-- 2. Packages become cohort-aware ------------------------------------------

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS cohort_id UUID REFERENCES public.cohorts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_packages_cohort ON public.packages(cohort_id);

COMMENT ON COLUMN public.packages.cohort_id IS
  'Optional cohort this package is delivered to. When set, package_assignments rows with source=cohort are kept in sync with cohort_members.';

ALTER TABLE public.package_assignments
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'cohort'));

COMMENT ON COLUMN public.package_assignments.source IS
  '"manual" = hand-picked via assignPackageToUsers; "cohort" = derived from cohort membership by syncCohortPackageAssignments and safe to auto-delete when a member leaves.';

-- 3. Prepare content library (global, superadmin-authored) -----------------

DO $$ BEGIN
  CREATE TYPE prepare_content_type AS ENUM ('video', 'quiz', 'preread');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.prepare_content_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID REFERENCES public.profiles(id),
  type prepare_content_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- video
  video_url TEXT,
  video_duration_seconds INTEGER,
  -- preread
  preread_url TEXT,
  preread_body TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.prepare_content_items IS
  'Global content library (not company-scoped) authored by superadmin: videos, quizzes, and pre-read resources. Assigned to cohorts via cohort_prepare_assignments.';

CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_item_id UUID NOT NULL REFERENCES public.prepare_content_items(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_content_item ON public.quiz_questions(content_item_id);

CREATE TABLE IF NOT EXISTS public.quiz_options (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quiz_options_question ON public.quiz_options(question_id);

ALTER TABLE public.prepare_content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_options ENABLE ROW LEVEL SECURITY;

-- Content items: title/description/video/preread fields are harmless to read
-- for any authenticated user; only superadmin authors them.
DROP POLICY IF EXISTS "Read prepare_content_items" ON public.prepare_content_items;
CREATE POLICY "Read prepare_content_items" ON public.prepare_content_items
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Superadmin insert prepare_content_items" ON public.prepare_content_items;
CREATE POLICY "Superadmin insert prepare_content_items" ON public.prepare_content_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );
DROP POLICY IF EXISTS "Superadmin update prepare_content_items" ON public.prepare_content_items;
CREATE POLICY "Superadmin update prepare_content_items" ON public.prepare_content_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );
DROP POLICY IF EXISTS "Superadmin delete prepare_content_items" ON public.prepare_content_items;
CREATE POLICY "Superadmin delete prepare_content_items" ON public.prepare_content_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

-- Quiz questions/options: superadmin-only for ALL operations, including SELECT.
-- quiz_options.is_correct must never be directly queryable by a regular user's
-- browser session — end users get quiz content exclusively through the
-- getQuizForAttempt server action, which reads via the service-role client
-- and strips is_correct before returning JSON.
DROP POLICY IF EXISTS "Superadmin all quiz_questions" ON public.quiz_questions;
CREATE POLICY "Superadmin all quiz_questions" ON public.quiz_questions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );
DROP POLICY IF EXISTS "Superadmin all quiz_options" ON public.quiz_options;
CREATE POLICY "Superadmin all quiz_options" ON public.quiz_options
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

-- 4. Cohort <-> content assignment ------------------------------------------

CREATE TABLE IF NOT EXISTS public.cohort_prepare_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  content_item_id UUID NOT NULL REFERENCES public.prepare_content_items(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.profiles(id),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cohort_id, content_item_id)
);

CREATE INDEX IF NOT EXISTS idx_cohort_prepare_assignments_cohort ON public.cohort_prepare_assignments(cohort_id);

ALTER TABLE public.cohort_prepare_assignments ENABLE ROW LEVEL SECURITY;

-- Readable by cohort members and the cohort's company admin/superadmin;
-- writable by company admin (own cohort) or superadmin (any) — admins may
-- attach existing library items to their own cohorts, but authoring new
-- items remains superadmin-only (enforced above on prepare_content_items).
DROP POLICY IF EXISTS "Read cohort_prepare_assignments" ON public.cohort_prepare_assignments;
CREATE POLICY "Read cohort_prepare_assignments" ON public.cohort_prepare_assignments
  FOR SELECT USING (
    cohort_id IN (SELECT cohort_id FROM public.cohort_members WHERE user_id = auth.uid())
    OR cohort_id IN (
      SELECT c.id FROM public.cohorts c
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = c.company_id))
    )
  );
DROP POLICY IF EXISTS "Admin insert cohort_prepare_assignments" ON public.cohort_prepare_assignments;
CREATE POLICY "Admin insert cohort_prepare_assignments" ON public.cohort_prepare_assignments
  FOR INSERT WITH CHECK (
    cohort_id IN (
      SELECT c.id FROM public.cohorts c
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = c.company_id))
    )
  );
DROP POLICY IF EXISTS "Admin delete cohort_prepare_assignments" ON public.cohort_prepare_assignments;
CREATE POLICY "Admin delete cohort_prepare_assignments" ON public.cohort_prepare_assignments
  FOR DELETE USING (
    cohort_id IN (
      SELECT c.id FROM public.cohorts c
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = c.company_id))
    )
  );

-- 5. Per-user Prepare progress ------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_prepare_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content_item_id UUID NOT NULL REFERENCES public.prepare_content_items(id) ON DELETE CASCADE,
  cohort_id UUID REFERENCES public.cohorts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, content_item_id, cohort_id)
);

CREATE INDEX IF NOT EXISTS idx_user_prepare_progress_user ON public.user_prepare_progress(user_id);

COMMENT ON TABLE public.user_prepare_progress IS
  'One row per user x content item x cohort. status=completed means the item was attempted/viewed, not necessarily a passing quiz score — see user_quiz_attempts.score for that detail.';

CREATE TABLE IF NOT EXISTS public.user_quiz_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content_item_id UUID NOT NULL REFERENCES public.prepare_content_items(id) ON DELETE CASCADE,
  cohort_id UUID REFERENCES public.cohorts(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}',
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_user ON public.user_quiz_attempts(user_id);

ALTER TABLE public.user_prepare_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quiz_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users CRUD own user_prepare_progress" ON public.user_prepare_progress;
CREATE POLICY "Users CRUD own user_prepare_progress" ON public.user_prepare_progress
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admin read user_prepare_progress" ON public.user_prepare_progress;
CREATE POLICY "Admin read user_prepare_progress" ON public.user_prepare_progress
  FOR SELECT USING (
    cohort_id IN (
      SELECT c.id FROM public.cohorts c
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = c.company_id))
    )
  );

DROP POLICY IF EXISTS "Users CRUD own user_quiz_attempts" ON public.user_quiz_attempts;
CREATE POLICY "Users CRUD own user_quiz_attempts" ON public.user_quiz_attempts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admin read user_quiz_attempts" ON public.user_quiz_attempts;
CREATE POLICY "Admin read user_quiz_attempts" ON public.user_quiz_attempts
  FOR SELECT USING (
    cohort_id IN (
      SELECT c.id FROM public.cohorts c
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = c.company_id))
    )
  );
