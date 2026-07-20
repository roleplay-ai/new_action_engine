-- Users can now edit their own AI-generated personal actions (e.g. from the
-- "Generated actions" library while the background plan-generation job is
-- still filling in the rest) — previously only admins could UPDATE actions.

CREATE POLICY "Users update own personal actions" ON public.actions
  FOR UPDATE USING (
    is_personal = TRUE AND created_by = auth.uid()
  ) WITH CHECK (
    is_personal = TRUE AND created_by = auth.uid()
  );
