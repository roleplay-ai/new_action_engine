# Participant Journey Redesign — Implementation Plan

Prototype: `docs/prototypes/participant-journey.html` (published at https://claude.ai/artifact/GKczpejnQBm6XzEdsMEeut).

## Goal

Collapse the participant flow into two places — **Dashboard** and **My Actions** — so a participant can write a plan, activate it and start practising without leaving the actions page.

| Today | After |
|---|---|
| Sidebar: Home, My Plan, My Actions, Commitment Points | Sidebar: Dashboard, My Actions (+ gift icon and score in the top bar) |
| `/plan`: name, designation, 3 questions | Pop-up on `/actions`: function, WhatsApp number, 1 question (name from profile) |
| Pace setup form (`Onboarding.tsx`) | Read-only "Recommended" summary (2/week × 6 weeks = 12) with a **Change** pop-up |
| Generate → review list → "Activate" → commitment pop-up → go to `/actions` | **Activate** → "creating your actions" pop-up → plan is live, same page |
| `/actions`: 6 tabs, buddy reveal pop-up, big email preview | Current actions first; Next reminders (2) + "See all"; History pop-up; Edit my plan drawer |
| Surprise boxes inside `/wallet` | Gift icon → `/surprises` page |

## What the backend already supports

- `saveGeneratedActions()` (`app/actions/ai-actions.ts:209`) creates the subscription and starts a background generation job (`personal_action_generation_jobs` → `/api/generate-actions-batch`). It already accepts `whatsappRemindersEnabled`, `whatsappNumber`, and `emailRemindersEnabled: true`.
- `activatePersonalActionPlan()` (`:615`) freezes the plan, assigns surprise resources and sends the summary email.
- `getActiveGenerationJob()` (`:710`) — used to poll progress.
- `updateUpcomingPersonalAction()` (`:841`) — edits an upcoming action on an **active** plan. Covers "✎ on upcoming actions".
- `saveMySessionNotes()` stores `MyPlanAnswers` (`lib/my-plan-notes.ts`): `name, designation, team, dailyWork, skillGoal, practiceOpportunities`.
- `getMySurpriseShelf()` / `markSurpriseBoxOpened()` and `components/SurpriseBoxes.tsx` (reveal pop-up).
- `getMyWhatsAppSettings()` / `updateMyWhatsAppReminders()` and `isWhatsAppAvailable()`.

## What the backend does not support yet

After activation the plan is locked: `generateOneMorePersonalAction()` returns *"Finalised plans are view-only"* (`ai-actions.ts:919`), and plan settings are shown as read-only. So three drawer options need new server work: **Change pace**, **Generate more actions**, **Rewrite my plan**. See Phase 4.

---

## Phase 1 — Navigation, dashboard add-on, surprise page (UI only, no schema change)

1. **Sidebar** — `components/Layout.tsx` `navItems`: keep `/journey` (label "Dashboard") and `/actions`. Remove "My Plan" and "Commitment Points" from both the sidebar and the mobile bottom nav.
2. **Top bar** — in `Layout.tsx` next to `participant-points-pill`, add a gift button linking to `/surprises`, with a badge for boxes in the `ready` state. Reuse `getMySurpriseShelf()`; refresh on the same `actionProgressKey` the score already uses.
3. **Dashboard add-on card** — new `components/journey/ActionPlanCard.tsx`, rendered in `RcplWorkspace.tsx` between `rcpl-program-hero` and `rcpl-content-shell`. Three states from `useEngine()` (`personalPlanState`, `generationJob`, `userActions`):
   - no plan → "Create my plan" → `/actions`
   - draft → "Activate my plan" → `/actions`
   - active → current actions with tick-off, done/total ring, next reminder, "My actions" link
4. **Surprise page** — new `app/(app)/surprises/page.tsx` reusing `getMySurpriseShelf()` and the reveal modal from `SurpriseBoxes.tsx`. Sections: Ready to open, Unlocked (opened + earlier batches), Coming up (**only the next 2 locked boxes**, plus a "+N more" tile). Back link uses `router.back()`.
5. **Retire routes softly** — *(moved to Phase 3: until the plan pop-up exists, `/plan` is still where plans are created, and the dashboard card links there.)* `/plan` and `/notes` redirect to `/actions`. `/wallet` stays reachable (score pill still links there) but is out of nav. Update the 9 internal `/plan` links (`grep -rn '"/plan"'`) — e.g. the plan-active callout, `CohortLockedNotice` copy, email templates' deep links.

## Phase 2 — My Actions page restructure (active plan)

File: `app/(app)/actions/actions-client.tsx`.

1. **Order** — header ("Your practice plan" + live dot, **History** button with pending count, **Edit my plan** button) → **Current actions** (keep `actions-current-card` markup and CSS exactly) → pending-validation strip (only when count > 0) → first-visit tip → Next reminders (first 2 of `upcoming`) with a collapsed "See all N actions" → buddy card.
2. **History pop-up** — move the `pending-validation`, `not-completed`, `completed` and `archived` tab bodies into a modal with the same tabs. Remove the `actions-tabs` nav. The "Plan overview" (`settings`) tab moves into the Edit drawer.
3. **Remove pop-ups** — drop the commitment buddy reveal (the `markMyCommitmentBuddyRevealed` effect at line 678 can be called silently on first load so the buddy still counts as "revealed"). Keep the small buddy card.
4. **Reminder previews** — under the buddy card add "Email reminder" and "WhatsApp reminder" buttons. Email reuses `ReminderEmailPreview` inside a modal (add a From line: `team@nudgeable.ai`). WhatsApp is a new `WhatsAppReminderPreview` built from the `plan_reminder_N` copy in `lib/whatsapp-templates.ts` (greeting, numbered actions, "Action N done" buttons, STOP footer). Remove the large inline email preview.
5. **Edit my plan drawer** — five cards styled like `cp-card` in `components/admin/control-panel/ControlPanelHome.tsx`: Edit an action (expands "See all", highlights ✎), Change pace, Generate more, Rewrite my plan, Reminders. Cards backed by Phase 4 are disabled with "Coming soon" until that ships, so Phase 2 can deploy on its own.
6. **First-visit tip** — dismissal stored in `localStorage` (per user + cohort).

## Phase 3 — Plan creation on `/actions` (no plan / draft)

1. **Plan pop-up** — new `components/actions/PlanFormModal.tsx`, opened automatically on the first visit to `/actions` when `personalPlanState === "none"`.
   - Heading "Hi {profile.name} 👋" + one-line description. No name field.
   - **Your function** → `answers.designation`.
   - **WhatsApp number** — fixed `+91` prefix, 10 digits, only shown when `isWhatsAppAvailable()`. Pre-fill from `getMyWhatsAppSettings().phone`.
   - The question *"What skill do you want to build, and where at work will you practise it?"* → `answers.skillGoal`. The sample answer goes in the placeholder (light grey), no "Show me an example" button.
   - Below the question: ☑ *Get reminders on WhatsApp · reply STOP anytime* — **ticked by default**; unticking makes the number optional.
   - Save → `saveMySessionNotes({ ...EMPTY_MY_PLAN_ANSWERS, name: profile.name, designation, skillGoal })`. Number and opt-in are held in client state until Activate (the subscription that stores them doesn't exist yet).
2. **Setup summary** (draft state, same page) — two cards: "Your plan" (function + answer, Edit) and "Your setup · Recommended": 12 actions, 2/week × 6 weeks, reminder day, *Emails will come from team@nudgeable.ai*, *Your email: {user.email}*, *Your WhatsApp no: +91 …*. **Change** opens a modal with the controls from `Onboarding.tsx` (track, duration capped by `cohort.maxWeeks`, per-week count, day) plus a WhatsApp opt-out. Email is a locked "always on" row.
3. **Activate** — one click:
   1. `saveGeneratedActions({ userNotes, track, dailyActionCount, daysOfWeek, durationWeeks, emailRemindersEnabled: true, whatsappRemindersEnabled, whatsappNumber: "+91" + digits })`
   2. Show the "Creating your actions" pop-up and poll `getActiveGenerationJob()` (progress = `generated / totalNeeded`).
   3. When the job completes, call `activatePersonalActionPlan()` automatically, then `refetch()`. The pop-up shows "Your actions are live" and closes itself.
   - **Resume:** if the participant reloads mid-generation, the page sees `generationJob` and re-opens the pop-up; on completion it still auto-activates.
   - **Failure:** job `failed` → pop-up shows the error and a "Try again" button (re-runs step 1).
4. **Remove** the review list, the 3-step pills and the "One commitment before you begin" pop-up from the participant flow. `plan-client.tsx`, `unified-plan-client.tsx`, `notes-client.tsx` and `Onboarding.tsx` become unused once `/plan` redirects; delete them in a follow-up after a release.

## Phase 4 — Editing an active plan (backend)

New server actions in `app/actions/ai-actions.ts`. Each one must leave released, completed and missed actions untouched and keep the commitment score fair.

| Action | Behaviour | Notes |
|---|---|---|
| `generateMorePersonalActionsForActivePlan(count)` | Appends one extra week of actions to the end of an active plan | Reuse the generation job; bump `total_actions_planned` and duration; assign surprise resources to the new actions |
| `updateActivePlanPace({ track, perWeek, durationWeeks, dayOfWeek })` | Reschedules only unreleased actions; trims unreleased actions or generates new ones to match the new total | Recompute `next_delivery_at` with `computeNextDeliveryAt`; must not change the score's denominator for weeks already passed |
| `rewriteActivePlan(answers)` | Saves new answers and regenerates unreleased actions only | Regenerate in place to keep plan order and surprise mappings |
| Reminders | Day and time → `updateActivePlanPace`; WhatsApp → existing `updateMyWhatsAppReminders` | Email has no off switch |

Needs a migration check: whether `activate_my_commitment_wallet_plan` / wallet calculations snapshot `total_actions_planned` at activation (if so, add a recalculation path).

## Open decisions

1. **Honesty commitment** — the activation pop-up was the only place participants agree to "confirm an action only when you genuinely did it". Proposal: one line in the action check-in pop-up (*"Confirm only actions you actually did."*) instead.
2. **Generation quality with one question** — the prompt in `/api/generate-actions-batch` reads all answer keys. Check its output when only `designation` and `skillGoal` are filled, and adjust the prompt if `dailyWork` / `practiceOpportunities` were weighted heavily.
3. **Activation wait** — *Decided:* keep today's generation time; no early activation.
4. **Non-Indian numbers** — *Decided:* `+91` only.
5. **Phase 4 scope** — ship Phases 1–3 first with Phase 4 cards disabled, or hold the release until Phase 4 is ready.

## Testing

- **Unit (vitest):** `lib/my-plan-notes` with only `designation` + `skillGoal`; phone validation (`+91` + 10 digits); "next 2 locked boxes" selector; the Phase 4 rescheduling maths (released actions never move).
- **Flow (manual, staging):** new participant → plan pop-up → setup → Activate → reload mid-generation → auto-activation → mark done → surprise box unlocks → open from the gift icon.
- **Regression:** reminder emails and WhatsApp deep links that pointed to `/plan` or `/wallet`; locked cohorts (`CohortLockedNotice` on `/actions` and `/surprises`); earlier-batch view (archived plans: read-only, no Activate); admin "Participant View".
- **Mobile:** bottom nav with 2 items, the plan pop-up as a bottom sheet, the History pop-up.

## Suggested order and size

| Phase | Depends on | Rough size |
|---|---|---|
| 1. Nav, dashboard card, `/surprises` | — | 2–3 days |
| 2. My Actions restructure | — | 2–3 days |
| 3. Plan pop-up + one-click activate | 2 (shares the page) | 3–4 days |
| 4. Editing an active plan | 2 | 4–6 days incl. score checks |

Phases 1 and 2 can be built in parallel and shipped behind a per-company flag (e.g. `companies.journey_v2`) so the current flow keeps working until QA signs off.
