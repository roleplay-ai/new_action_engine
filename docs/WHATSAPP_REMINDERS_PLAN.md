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

### Phase 1 — Webhook ✅ (verified end to end on the preview deployment)
- `app/api/webhooks/whatsapp/route.ts`: GET verification handshake, POST with
  `X-Hub-Signature-256` check; parsing in `lib/whatsapp-webhook.ts`.
- `supabase/migrations/082_whatsapp_webhook.sql`: `whatsapp_message_logs`
  (status per wamid, forward-only), `whatsapp_inbound_messages`,
  `whatsapp_webhook_events`.
- Env: `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`.
- Done when: a `hello_world` test send shows sent → delivered → read in
  `whatsapp_message_logs`, and a reply appears in `whatsapp_inbound_messages`.

### Phase 2 — Phone numbers + opt-in ✅ (this branch)
- `supabase/migrations/083_whatsapp_contacts.sql`: `whatsapp_contacts` (one
  number per participant, unique; `opted_out_at` set by STOP) and
  `personal_action_subscriptions.whatsapp_reminders_enabled` /
  `whatsapp_opted_in_at` (per-plan choice; existing plans default off).
- Admin: superadmin → Users → Edit user → **WhatsApp number** (default the
  participant sees; list shows the number and a STOP badge).
- Plan setup (`components/Onboarding.tsx`): **Send my reminders on WhatsApp**,
  ticked by default (unticked if they previously replied STOP), with the
  admin's number pre-filled and editable. Saved by `saveGeneratedActions`.
- My Actions → Plan overview (`components/WhatsAppRemindersCard.tsx`): turn
  WhatsApp off/on or change the number at any time, even after finalising.
- Webhook (`lib/whatsapp-inbound.ts`): STOP / UNSUBSCRIBE pauses WhatsApp for
  every plan; START resumes and re-enables their unarchived plans. Only newly
  received messages are acted on, so Meta retries can't double-process.
- Numbers are normalised to digits with country code; a bare 10-digit number
  is assumed Indian (+91).
- **Phase 4 sends a WhatsApp reminder only when** the plan has
  `whatsapp_reminders_enabled`, the person has a number, and
  `opted_out_at IS NULL`.
- Env: `WHATSAPP_PHONE_NUMBER_ID` (shows the options), `WHATSAPP_ACCESS_TOKEN`
  (confirmation replies now, reminders in Phase 4).

### Phase 3 — Templates ✅ submitted (pending Meta review)
Template parameters can't contain line breaks, so each action needs its own
line in the template itself: one UTILITY template per action count, chosen by
`buildActionReminder()` in `lib/whatsapp-templates.ts`.

| Template | Id | Lines |
|---|---|---|
| `action_reminder_1` | 3561293904030778 | 1 (singular, unnumbered) |
| `action_reminder_2` | 3696282903855083 | 2 |
| `action_reminder_3` | 1703608441293691 | 3 |
| `action_reminder_4` | 1969471500396295 | 4 |
| `action_reminder_5` | 28562238106732647 | 5 (6+ actions: "(+N more)" on line 5) |

- Header: "Your {{1}} actions are ready" ({{1}} company; falls back to "Nudgeable").
- Body: "Hi {{1}}, this is your scheduled reminder. These actions from your plan
  are due {{2}}: / 1) {{3}} / 2) {{4}} … / Open Nudgeable to see how to do each
  one and mark them done when you finish." — {{2}} "this week" | "today".
- Footer: "Reply STOP to turn off WhatsApp reminders".
- URL button "View my actions" →
  `https://practice.nudgeable.ai/api/auto-login?next=%2Factions&key={{1}}`
  (persistent login key, same as reminder emails); Meta link tracking off.
- **Wording must stay strictly factual.** `action_reminder_company` added
  "Nudgie here!", "Small steps, real change 💪" and emoji, and Meta approved it
  as MARKETING instead of UTILITY (utility = no promotional or persuasive
  intent; mixed content → marketing). Repeated misclassification can get the
  business's utility templates restricted. Earlier drafts `action_reminder`
  (UTILITY) and `action_reminder_company` (MARKETING) are not used by the code.
- Approval/rejection arrives on the webhook as
  `message_template_status_update` (stored in `whatsapp_webhook_events`).

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
