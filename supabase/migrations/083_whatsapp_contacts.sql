-- WhatsApp numbers + opt-in — Phase 2 of docs/WHATSAPP_REMINDERS_PLAN.md.
--
-- * Admins save a participant's WhatsApp number (superadmin Users page).
-- * When generating a plan, the participant sees "Send my reminders on
--   WhatsApp" ticked by default with that number pre-filled; they can untick
--   it or edit the number. The choice is stored on the plan.
-- * Replying STOP on WhatsApp opts the person out of every plan until they
--   reply START or turn WhatsApp back on in the app.
--
-- A reminder goes out on WhatsApp only when the plan has
-- whatsapp_reminders_enabled, the person has a number, and
-- whatsapp_contacts.opted_out_at IS NULL.

CREATE TABLE IF NOT EXISTS public.whatsapp_contacts (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Digits only, country code first, as WhatsApp reports a sender
  -- (e.g. 919800000000). Unique so a STOP maps to exactly one person.
  phone TEXT NOT NULL UNIQUE CHECK (phone ~ '^[1-9][0-9]{7,14}$'),
  -- Who last set the number: an admin, or the participant themselves.
  phone_source TEXT NOT NULL CHECK (phone_source IN ('admin', 'participant')),
  phone_updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  profile_name TEXT,
  -- Set when the person replies STOP; cleared by START or by turning
  -- WhatsApp reminders back on in the app.
  opted_out_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;

-- Read and written only through server actions / the webhook (service role).
CREATE POLICY "Service role only whatsapp_contacts" ON public.whatsapp_contacts
  FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE public.whatsapp_contacts IS
  'One WhatsApp number per participant (pre-filled by an admin, editable by the participant). opted_out_at is set by a STOP reply and blocks WhatsApp reminders for every plan.';

-- Per-plan choice made at plan generation. Existing plans never saw the
-- option, so they default to off.
ALTER TABLE public.personal_action_subscriptions
  ADD COLUMN IF NOT EXISTS whatsapp_reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS whatsapp_opted_in_at TIMESTAMPTZ;

COMMENT ON COLUMN public.personal_action_subscriptions.whatsapp_reminders_enabled IS
  'Participant ticked "Send my reminders on WhatsApp" for this plan (default ticked at generation; can be turned off/on later from My Actions). whatsapp_opted_in_at records when it was last turned on.';
