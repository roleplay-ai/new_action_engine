-- Stream cohort chat inserts to authorized clients over Supabase Realtime.
-- RLS on cohort_messages continues to restrict each socket to conversations
-- the signed-in cohort member or trainer is allowed to read.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.cohort_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
