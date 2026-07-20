-- Users can delete their own AI-generated personal actions that haven't been
-- assigned/completed yet (from the "Generated actions" library).

CREATE POLICY "Users delete own personal actions" ON public.actions
  FOR DELETE USING (
    is_personal = TRUE AND created_by = auth.uid()
  );
