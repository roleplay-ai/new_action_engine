-- Cohort-scoped conversation between participants and company admins (trainers).

CREATE TABLE IF NOT EXISTS public.cohort_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cohort_messages_cohort_created
  ON public.cohort_messages(cohort_id, created_at DESC);

ALTER TABLE public.cohort_messages ENABLE ROW LEVEL SECURITY;

-- Participants can access only conversations for cohorts they belong to.
-- Company admins are the trainers in the current role model and can access
-- conversations belonging to their company. Superadmins can access any cohort.
DROP POLICY IF EXISTS "Cohort members and trainers read messages" ON public.cohort_messages;
CREATE POLICY "Cohort members and trainers read messages" ON public.cohort_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.cohort_members cm
      WHERE cm.cohort_id = cohort_messages.cohort_id
        AND cm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.cohorts c ON c.id = cohort_messages.cohort_id
      WHERE p.id = auth.uid()
        AND (p.role = 'superadmin' OR (p.role = 'admin' AND p.company_id = c.company_id))
    )
  );

DROP POLICY IF EXISTS "Cohort members and trainers send messages" ON public.cohort_messages;
CREATE POLICY "Cohort members and trainers send messages" ON public.cohort_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.cohort_members cm
        WHERE cm.cohort_id = cohort_messages.cohort_id
          AND cm.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.cohorts c ON c.id = cohort_messages.cohort_id
        WHERE p.id = auth.uid()
          AND (p.role = 'superadmin' OR (p.role = 'admin' AND p.company_id = c.company_id))
      )
    )
  );

DROP POLICY IF EXISTS "Senders delete own cohort messages" ON public.cohort_messages;
CREATE POLICY "Senders delete own cohort messages" ON public.cohort_messages
  FOR DELETE USING (sender_id = auth.uid());

COMMENT ON TABLE public.cohort_messages IS
  'Cohort-isolated Journey chat. Company admins act as trainers in the current role model.';
