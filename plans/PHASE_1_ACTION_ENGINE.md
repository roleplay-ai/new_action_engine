# Phase 1: Action engine, scheduling, and habit loop

**Planning source:** [PRODUCT_GUIDE.md](../PRODUCT_GUIDE.md) | **Multi-tenant:** [docs/MULTI_TENANT_DESIGN.md](../docs/MULTI_TENANT_DESIGN.md) | **Overview:** [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md)

**Product Guide mapping:** Core User Features – **Action Library (Challenges)**, **Intention & Planning** (Plan Overlay), **Validation Queue**, **Habit Loop (Repetition Engine)**; Behavioral Analytics – **Effort Ledger** (XP rules), **Leagues**.

**Goal:** Actions work end-to-end: browse **company-scoped** Action Library, schedule actions (user-driven), persist to Supabase, validate, habit loop, cementing. Points and league computed. No notifications or social layer yet.

---

## 1.1 Action Library (Challenges) and discovery (company-scoped)

- **Multi-tenant:** Actions are scoped by company. User must have `company_id` set; show only actions where `action.company_id` = user’s `company_id`. If user has no company_id, show empty state or “Not assigned to a company.”
- Server: `getActions(theme?, companyId)` or get company from profile and `getActions(theme?)` filtering by profile.company_id; `getUserActions(userId)`.
- **Product Guide:** Search & filter by status (Active, Completed) and theme; each card shows **How** (tactical steps) and **Why** (cognitive impact).
- UI: Carousel / Action Library in [app/(app)/page.tsx](../app/(app)/page.tsx) fed from Supabase (company-scoped).

## 1.2 User scheduling (Intention & Planning) – persist to Supabase

- **Plan Overlay (Product Guide):** User commits to specific day and time in [ActionCard](../components/ActionCard.tsx).
- Server Action: `scheduleAction(actionId, scheduledAt)` (or `acceptAction`) – inserts/updates `user_actions` (user_id from auth, action_id, status `scheduled`, `scheduled_at` from user’s chosen day+time). Store `is_calendar_synced` when user opts in; award +2 XP in Phase 1 when they confirm sync (or in validation step).
- Replace client-only `acceptAction` in [lib/store.tsx](../lib/store.tsx) with this Server Action; keep Plan Overlay UX, send chosen datetime to Server Action.
- Fetch “my scheduled actions” and **Validation Queue** from Supabase (user_actions for current user) instead of localStorage.

## 1.3 Validation Queue and execution

- **Validation Queue (Product Guide):** Once scheduled time has passed, action enters queue; user must **Verify Impact** (did they do it?).
- Server Action: `validateAction(userActionId, success, reflection?)`. Update `user_actions` (status, **reflection** = Impact Notes); update `profiles` (total_points, streak, last_active_at) using **Effort Ledger** rules below.
- **Impact Notes (Product Guide):** Optional reflection; store in `user_actions.reflection`.
- Emit feed event: insert `feed_events` (SUCCESS/DECLINED etc.) so Phase 4 (Social) can show them later.

## 1.4 Habit Loop (Repetition Engine) and cementing

- **Rep Loops (Product Guide):** On successful validation, prompt **Habit Loop**; action must be validated **5 times (configurable)** before **Cementing**.
- When user completes: if `completed_reps + 1 >= reps_remaining` (e.g. 5), set status to `cemented`; else `habit_started`, increment `completed_reps`, set `reps_remaining` (e.g. 5) if first time.
- Insert feed_events for HABIT_STARTED and CEMENTED.

## 1.5 Effort Ledger and Leagues (single source of truth)

- **Effort Ledger (Product Guide):** Acceptance 3 XP, Honesty Skip 1 XP, Successful Validation 5 XP, Habit Cementing 10 XP, Calendar Sync +2 XP, **Streaks** (weekly consistency).
- **Leagues:** Starter 0–24, Bronze 25–49, Silver 50–99, Gold 100–199, Diamond 200+.
- Implement `apply_point_rules(event)` used by all Server Actions that change points.

---

## Deliverables

- Action Library from DB; user scheduling (Plan Overlay → Supabase, user_actions persisted); Validation Queue + Verify Impact + Impact Notes; Habit Loop + Cementing (Rule of 5); Effort Ledger + Leagues; feed_events emitted for later Nudgeboard.

---

## File and folder hints

- `app/actions/user-actions.ts` (scheduleAction), `app/actions/validate-action.ts`, `lib/points.ts`, habit logic in Server Action or `lib/habit.ts`.

---

**Prev:** [PHASE_0_FOUNDATION.md](PHASE_0_FOUNDATION.md) | **Next:** [PHASE_2a_COMPANY_ADMIN.md](PHASE_2a_COMPANY_ADMIN.md)
