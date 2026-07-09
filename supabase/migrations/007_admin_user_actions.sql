-- Phase 2a: Allow company admins to create user_actions for users in their company
-- (needed for Deploy & Enrol - package assignment)

CREATE POLICY "Admin insert user_actions for company users" ON public.user_actions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'superadmin')
    OR user_id IN (
      SELECT p.id FROM public.profiles p
      WHERE p.company_id = (SELECT pr.company_id FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin' LIMIT 1)
    )
  );

CREATE POLICY "Admin update user_actions for company users" ON public.user_actions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'superadmin')
    OR user_id IN (
      SELECT p.id FROM public.profiles p
      WHERE p.company_id = (SELECT pr.company_id FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin' LIMIT 1)
    )
  );
