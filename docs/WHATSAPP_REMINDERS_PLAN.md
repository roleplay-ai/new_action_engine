# WhatsApp Action Reminders — Plan

Goal: send the participant action reminder (today an email from
`sendDailyActionReminders` in `lib/action-reminders.ts`, on the participant's
chosen weekday — or every weekday on the daily track) over WhatsApp as well,
using the WhatsApp Cloud API on the **Nudgeable consulting** business.

Reference: https://developers.facebook.com/documentation/business-messaging/whatsapp/overview

## Key platform constraints

- Business-initiated messages outside the 24-hour customer-service window must
  be **approved templates**. A reminder is always outside that window, so it is
  a template (category: utility).
- Template variables cannot contain newlines, so the WhatsApp reminder is a
  short summary plus a link, not the full email.
- Explicit **opt-in** is required before sending, naming the business and what
  will be sent.
- Delivery status (sent / delivered / read / failed) and user replies only
  arrive via **webhook**.
- Default limits: 80 msg/s per number; ~1 message per 6 s to the same user
  (error 131056); retry failed sends after 4^n seconds. Unverified businesses
  get lower daily send limits.

## Phases

### Phase 0 — Meta setup
- Meta app with the WhatsApp use case, linked to the Nudgeable consulting business portfolio.
- Add + register the business phone number; create a system user token
  (`business_management`, `whatsapp_business_messaging`, `whatsapp_business_management`).
- Start Business Verification in parallel.

### Phase 1 — Webhook ✅ (this branch)
- `app/api/webhooks/whatsapp/route.ts`: GET verification handshake, POST with
  `X-Hub-Signature-256` check; parsing in `lib/whatsapp-webhook.ts`.
- `supabase/migrations/082_whatsapp_webhook.sql`: `whatsapp_message_logs`
  (status per wamid, forward-only), `whatsapp_inbound_messages`,
  `whatsapp_webhook_events`.
- Env: `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`.
- Done when: a `hello_world` test send shows sent → delivered → read in
  `whatsapp_message_logs`, and a reply appears in `whatsapp_inbound_messages`.

### Phase 2 — Phone numbers + opt-in
- Store an E.164 WhatsApp number, opt-in flag and timestamp per participant;
  `whatsapp_reminders_enabled` per plan next to `email_reminders_enabled`.
- In-app capture with explicit consent copy.
- Webhook: "STOP" from a known number turns WhatsApp reminders off.

### Phase 3 — Template
- Create and submit a utility template (e.g. `action_reminder`): name, action
  count, top action titles, "View my actions" URL button. Approval can take time,
  and Meta may recategorise it as marketing.

### Phase 4 — Sending
- `lib/whatsapp.ts` `sendTemplate()` with backoff; insert an `accepted` row
  into `whatsapp_message_logs` with `user_id`/`purpose` on send.
- Hook into `sendDailyActionReminders` after the email batch, with its own
  claim/log so email and WhatsApp can't block or double each other.

### Phase 5 — Admin + extras
- WhatsApp delivered/read/failed in the superadmin reminder logs panel.
- Optional per-cohort rollout flag.
- Later: "Done" quick-reply button completing the action via the webhook;
  Friday recap on WhatsApp.
