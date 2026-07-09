-- Fix: infinite recursion in profiles RLS policies.
-- Policies that SELECT from profiles while evaluating access to profiles cause recursion.
-- Use SECURITY DEFINER functions so role/company_id are read without triggering RLS.

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Replace policies that query profiles (causing recursion) with function-based checks
DROP POLICY IF EXISTS "Superadmin update any profile" ON public.profiles;
CREATE POLICY "Superadmin update any profile" ON public.profiles
  FOR UPDATE USING (public.current_user_role() = 'superadmin');

DROP POLICY IF EXISTS "Company admin read company profiles" ON public.profiles;
CREATE POLICY "Company admin read company profiles" ON public.profiles
  FOR SELECT USING (
    company_id IS NOT NULL
    AND company_id = public.current_user_company_id()
    AND public.current_user_role() IN ('admin', 'superadmin')
  );
