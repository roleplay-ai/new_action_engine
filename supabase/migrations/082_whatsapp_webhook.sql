-- WhatsApp Cloud API webhook — Phase 1 of docs/WHATSAPP_REMINDERS_PLAN.md.
--
-- app/api/webhooks/whatsapp/route.ts receives Meta's webhook events and
-- records them here:
--   * outgoing message status updates (sent / delivered / read / failed)
--     → whatsapp_message_logs, one row per WhatsApp message id (wamid);
--   * incoming user messages → whatsapp_inbound_messages;
--   * everything else (template approval updates, account alerts, ...)
--     → whatsapp_webhook_events as raw JSON, for debugging.
--
-- Meta retries a delivery until it gets a 200, and can deliver the same event
-- more than once or out of order, so every write here is idempotent on wamid.
-- All tables are service-role only, like personal_action_reminder_logs.

-- ---------------------------------------------------------------------------
-- Outgoing messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_message_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wamid TEXT NOT NULL UNIQUE,
  -- Filled by the sender (Phase 4). NULL for rows first seen via the webhook,
  -- e.g. a test template sent from the Meta dashboard.
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_phone TEXT,
  template_name TEXT,
  purpose TEXT,
  -- 'accepted' is what the send API returns; the rest come from the webhook.
  status TEXT NOT NULL CHECK (status IN ('accepted', 'sent', 'delivered', 'read', 'failed')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_code INTEGER,
  error_title TEXT,
  error_details TEXT,
  pricing_category TEXT,
  conversation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_logs_created
  ON public.whatsapp_message_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_message_logs_user
  ON public.whatsapp_message_logs(user_id);

ALTER TABLE public.whatsapp_message_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only whatsapp_message_logs" ON public.whatsapp_message_logs
  FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE public.whatsapp_message_logs IS
  'One row per outgoing WhatsApp message (wamid). status only moves forward (accepted < sent < delivered < read < failed) even when webhook events arrive out of order; each step keeps its own timestamp.';

-- Status precedence used to ignore late/out-of-order webhook events.
CREATE OR REPLACE FUNCTION public.whatsapp_status_rank(p_status TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'accepted' THEN 0
    WHEN 'sent' THEN 1
    WHEN 'delivered' THEN 2
    WHEN 'read' THEN 3
    WHEN 'failed' THEN 4
    ELSE -1
  END;
$$;

-- Atomic upsert for one status event, so concurrent "delivered" and "read"
-- deliveries for the same message can't overwrite each other.
CREATE OR REPLACE FUNCTION public.record_whatsapp_message_status(
  p_wamid TEXT,
  p_status TEXT,
  p_status_at TIMESTAMPTZ,
  p_recipient TEXT DEFAULT NULL,
  p_error_code INTEGER DEFAULT NULL,
  p_error_title TEXT DEFAULT NULL,
  p_error_details TEXT DEFAULT NULL,
  p_pricing_category TEXT DEFAULT NULL,
  p_conversation_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.whatsapp_message_logs AS l (
    wamid, to_phone, status,
    sent_at, delivered_at, read_at, failed_at,
    error_code, error_title, error_details,
    pricing_category, conversation_id
  )
  VALUES (
    p_wamid, p_recipient, p_status,
    CASE WHEN p_status = 'sent' THEN p_status_at END,
    CASE WHEN p_status = 'delivered' THEN p_status_at END,
    CASE WHEN p_status = 'read' THEN p_status_at END,
    CASE WHEN p_status = 'failed' THEN p_status_at END,
    p_error_code, p_error_title, p_error_details,
    p_pricing_category, p_conversation_id
  )
  ON CONFLICT (wamid) DO UPDATE SET
    status = CASE
      WHEN public.whatsapp_status_rank(EXCLUDED.status) > public.whatsapp_status_rank(l.status)
        THEN EXCLUDED.status
      ELSE l.status
    END,
    to_phone = COALESCE(l.to_phone, EXCLUDED.to_phone),
    sent_at = COALESCE(l.sent_at, EXCLUDED.sent_at),
    delivered_at = COALESCE(l.delivered_at, EXCLUDED.delivered_at),
    read_at = COALESCE(l.read_at, EXCLUDED.read_at),
    failed_at = COALESCE(l.failed_at, EXCLUDED.failed_at),
    error_code = COALESCE(EXCLUDED.error_code, l.error_code),
    error_title = COALESCE(EXCLUDED.error_title, l.error_title),
    error_details = COALESCE(EXCLUDED.error_details, l.error_details),
    pricing_category = COALESCE(EXCLUDED.pricing_category, l.pricing_category),
    conversation_id = COALESCE(EXCLUDED.conversation_id, l.conversation_id),
    updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.record_whatsapp_message_status(TEXT, TEXT, TIMESTAMPTZ, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_whatsapp_message_status(TEXT, TEXT, TIMESTAMPTZ, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Incoming messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wamid TEXT NOT NULL UNIQUE,
  -- The business number that received it (Meta's phone_number_id).
  phone_number_id TEXT,
  from_phone TEXT NOT NULL,
  profile_name TEXT,
  message_type TEXT NOT NULL,
  -- Text body, or the button/interactive reply title for those types.
  text_body TEXT,
  -- Button payload / interactive reply id, used by Phase 5 quick replies.
  reply_payload TEXT,
  -- wamid of the message this one replies to, if any.
  context_wamid TEXT,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_messages_from
  ON public.whatsapp_inbound_messages(from_phone, received_at DESC);

ALTER TABLE public.whatsapp_inbound_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only whatsapp_inbound_messages" ON public.whatsapp_inbound_messages
  FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE public.whatsapp_inbound_messages IS
  'Messages participants send to the business WhatsApp number, deduplicated on wamid. Not linked to profiles until phone numbers are stored (Phase 2).';

-- ---------------------------------------------------------------------------
-- Other webhook fields (raw)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  field TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_field
  ON public.whatsapp_webhook_events(field, created_at DESC);

ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only whatsapp_webhook_events" ON public.whatsapp_webhook_events
  FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE public.whatsapp_webhook_events IS
  'Raw WhatsApp webhook changes other than messages/statuses (e.g. message_template_status_update, account_alerts), kept for debugging.';
