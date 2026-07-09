-- Phase 2a: Packages (company-scoped)
-- packages, package_actions, package_assignments

CREATE TABLE IF NOT EXISTS public.packages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id),
  name TEXT NOT NULL,
  description TEXT,
  skill_theme TEXT,
  start_date DATE,
  duration_weeks INTEGER DEFAULT 8,
  actions_per_week INTEGER DEFAULT 2,
  delivery_time TIME,
  rule_of_five INTEGER DEFAULT 5,
  points_weight INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.package_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  action_id UUID NOT NULL REFERENCES public.actions(id) ON DELETE CASCADE,
  week_number INTEGER,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(package_id, action_id)
);

CREATE TABLE IF NOT EXISTS public.package_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scheduled_start_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(package_id, user_id)
);

ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_assignments ENABLE ROW LEVEL SECURITY;

-- Packages: company admin of that company or superadmin
CREATE POLICY "Read packages in my company" ON public.packages
  FOR SELECT USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );
CREATE POLICY "Admin insert packages" ON public.packages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (
      p.role = 'superadmin'
      OR (p.role = 'admin' AND p.company_id = company_id)
    ))
  );
CREATE POLICY "Admin update packages" ON public.packages
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (
      p.role = 'superadmin'
      OR (p.role = 'admin' AND p.company_id = packages.company_id)
    ))
  );
CREATE POLICY "Admin delete packages" ON public.packages
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (
      p.role = 'superadmin'
      OR (p.role = 'admin' AND p.company_id = packages.company_id)
    ))
  );

-- Package actions: same as package access
CREATE POLICY "Read package_actions" ON public.package_actions
  FOR SELECT USING (
    package_id IN (SELECT id FROM public.packages WHERE company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );
CREATE POLICY "Admin insert package_actions" ON public.package_actions
  FOR INSERT WITH CHECK (
    package_id IN (
      SELECT p.id FROM public.packages p
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = p.company_id))
    )
  );
CREATE POLICY "Admin update delete package_actions" ON public.package_actions
  FOR UPDATE USING (
    package_id IN (
      SELECT p.id FROM public.packages p
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = p.company_id))
    )
  );
CREATE POLICY "Admin delete package_actions" ON public.package_actions
  FOR DELETE USING (
    package_id IN (
      SELECT p.id FROM public.packages p
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = p.company_id))
    )
  );

-- Package assignments: same
CREATE POLICY "Read package_assignments" ON public.package_assignments
  FOR SELECT USING (
    package_id IN (SELECT id FROM public.packages WHERE company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );
CREATE POLICY "Admin insert package_assignments" ON public.package_assignments
  FOR INSERT WITH CHECK (
    package_id IN (
      SELECT p.id FROM public.packages p
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = p.company_id))
    )
  );
CREATE POLICY "Admin update package_assignments" ON public.package_assignments
  FOR UPDATE USING (
    package_id IN (
      SELECT p.id FROM public.packages p
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = p.company_id))
    )
  );
CREATE POLICY "Admin delete package_assignments" ON public.package_assignments
  FOR DELETE USING (
    package_id IN (
      SELECT p.id FROM public.packages p
      JOIN public.profiles pr ON pr.id = auth.uid() AND (pr.role = 'superadmin' OR (pr.role = 'admin' AND pr.company_id = p.company_id))
    )
  );
