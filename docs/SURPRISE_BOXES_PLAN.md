# Surprise Boxes — Implementation Plan

Replace the "points added" celebration with a **Surprise Box** reveal. Super admin curates a library of 30+ videos and resources, each with a short description. When a participant finalises their action plan, a separate Gemini matcher maps every action to the best-fitting resource. Marking an action done (on time or late) unlocks that action's box. The reminder email's "Mark done" link plays a three-step Nudgie sequence (dance → door → notebook) and lands on the Wallet with the reveal open.

Prototype: `public/prototypes/surprise-box.html` (published at https://claude.ai/artifact/MkyyzMSQqJ1uYhpVZiQfuX).

## Agreed decisions

| Topic | Decision |
|---|---|
| Content source | A **new super-admin library** (not the Prepare content library), at least 30 items, each with a description used for matching. |
| Storage | A **new storage bucket** `surprise-box-resources`; nothing goes in `email-assets` or the other existing buckets. |
| Resource format | Either an **uploaded file** (video, PDF) in the new bucket **or an external link** (YouTube, article). |
| Mapping | A **separate Gemini matcher** maps each action to one resource by its description, right after the plan is finalised. |
| What a box reveals | The resource mapped to **the action just completed**. |
| More actions than resources | Resources **may repeat**. |
| Late completions | **Unlock** the box (as do on-time completions and Pending-validation confirmations). |
| Existing cohorts | No backfill. Plans finalised before launch see a **locked shelf** and keep today's points celebration. |

---

## 1. How it works today

| Step | Where | What the user sees |
|---|---|---|
| Click "Mark done" in email | `lib/email-send.ts` builds `/api/auto-login?key=…&next=/actions?completeAction=<id>` | — |
| Server sign-in | `app/api/auto-login/route.ts` (redirect only) | — |
| Session set | `app/auth/callback/page.tsx` | `PageLoader theme="email-signin"` |
| Page loading | `components/Layout.tsx` (`fromEmailLink`) | `PageLoader theme="email-signin"` |
| Action settled | `actions-client.tsx` → `completeAction()` (`app/actions/user-actions.ts`) | `PageLoader theme="email-complete"` |
| Celebration | `components/ConfettiCelebration.tsx` | "Action completed!" + points |
| Continue | `router.push("/wallet")` | Wallet page |

Plans are finalised in `activatePersonalActionPlan()` (`app/actions/ai-actions.ts`), which calls `activate_my_commitment_wallet_plan`. The existing **action-image matcher** (`lib/action-image-matching.ts`) already maps actions to a fixed library with a small Gemini model, run in the background with `after()` — the resource matcher follows the same pattern.

## 2. Target flow

1. **Email "Mark done"** → `/api/auto-login` (unchanged).
2. **`/auth/callback`** — Nudgie **dance** (`nudgie-dance.gif`, 3.2 s) while the session is set.
3. **`/actions` loading** — Nudgie **door** (`nudgie-door.gif`, 7.2 s).
4. **Settling the action** — Nudgie **notebook** (`nudgie-notebook.gif`, 7.3 s) while `completeAction()` runs and unlocks the box.
5. **`router.replace("/wallet?reveal=<unlockId>")`** — the reveal popup: tap the box → it opens → the action's resource (Watch now / Open resource), with the cut-out **joy** Nudgie (`nudgie-joy.webp`) and speech bubble beside it.
6. The box stays on the Wallet's **Surprise Boxes shelf**.

In-app "I did it" runs steps 4–6. The Friday recap's "I completed all" unlocks several boxes; the reveal opens them one after another.

## 3. Database — `supabase/migrations/081_surprise_boxes.sql`

### Storage bucket
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('surprise-box-resources', 'surprise-box-resources', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
```
Public for durable URLs; writes only via the service role (same convention as `080_email_assets_bucket.sql`). Paths: `resources/<id>/<file>` and `thumbnails/<id>/<file>`.

### `surprise_box_resources` — the super-admin library
| Column | Notes |
|---|---|
| `id` UUID PK | |
| `title` TEXT NOT NULL | Shown on the box card. |
| `description` TEXT NOT NULL | What the resource is about. **Used by the matcher**; also shown on the card. |
| `kind` TEXT CHECK IN ('video','resource') | Drives "Watch now" vs "Open resource" and the icon. |
| `source` TEXT CHECK IN ('upload','link') | |
| `storage_path` TEXT NULL | Set when `source = 'upload'`. |
| `external_url` TEXT NULL | Set when `source = 'link'`. CHECK that exactly one of the two is set. |
| `thumbnail_path` TEXT NULL | Optional cover image in the same bucket. |
| `duration_label` TEXT NULL | e.g. "4 min", "PDF · 2 pages". |
| `is_active` BOOLEAN DEFAULT TRUE | Deactivate instead of delete once a resource has been mapped. |
| `created_by`, `created_at`, `updated_at` | |

RLS: superadmin full access; authenticated users may read active rows (participants only ever reach them through their own mappings/unlocks).

### Mapping — `actions.surprise_resource_id`
`ALTER TABLE actions ADD COLUMN surprise_resource_id UUID REFERENCES surprise_box_resources(id) ON DELETE SET NULL;` — mirrors the existing `actions.image_url` written by the image matcher.

### Gating — `commitment_wallet_plans.surprise_boxes_enabled`
```sql
ALTER TABLE commitment_wallet_plans ADD COLUMN surprise_boxes_enabled BOOLEAN NOT NULL DEFAULT FALSE;  -- existing plans: false
ALTER TABLE commitment_wallet_plans ALTER COLUMN surprise_boxes_enabled SET DEFAULT TRUE;           -- plans finalised after launch: true
```
No application code needed to tell old plans from new ones.

### `surprise_box_unlocks` — boxes a participant has unlocked
| Column | Notes |
|---|---|
| `id` UUID PK | |
| `user_id`, `cohort_id`, `plan_id` | |
| `action_id` UUID **UNIQUE** → `actions` | One box per action; makes unlocking idempotent. |
| `resource_id` UUID → `surprise_box_resources` | Snapshot at unlock time, so later re-mapping doesn't change an opened box. |
| `unlocked_at`, `opened_at` NULL | `opened_at` is set when the participant taps the box. |

### Functions
- **`unlock_my_surprise_box(p_action_id UUID)`** — `SECURITY DEFINER`, as `auth.uid()`:
  - requires a `success` `user_actions` row (on time, late or validated) and a plan with `surprise_boxes_enabled`;
  - returns the existing unlock if one exists for this action (double clicks, reused email links, bulk "complete all");
  - uses `actions.surprise_resource_id`; if it's empty (matcher failed or still running), falls back to the participant's least-used active resource so a box is never empty.
- **`mark_my_surprise_box_opened(p_unlock_id UUID)`** — sets `opened_at` once.

### Also in this migration
- Recreate `purge_user_owned_data()` (latest body in `055_fix_purge_user_owned_data_stale_tables.sql`) with `DELETE FROM public.surprise_box_unlocks WHERE user_id = p_user_id;`.
- Document the new tables and columns in `docs/documentation/04-data-model.md`.

## 4. Resource matcher — `lib/surprise-resource-matching.ts`

Modelled on `lib/action-image-matching.ts`:
- Loads active resources (`title`, `description`) and the plan's actions (`title`, `how`, `why`).
- One Gemini call (`GEMINI_IMAGE_MATCH_MODEL`, overridable via a new `GEMINI_SURPRISE_MATCH_MODEL`) with a JSON schema returning `{ actionIndex, resourceIndex }` pairs — indexes, not UUIDs, for the same reliability reason the image matcher gives.
- Prompt: match on the underlying skill or situation in the description; every action must get a resource; **prefer variety — use each resource once before repeating; repeats are allowed when there are more actions than resources**.
- Writes `actions.surprise_resource_id`. Never throws into its caller.
- Batches large plans so one call never carries too many actions.

**Where it runs (all via `after()`, so nobody waits on it):**
- `activatePersonalActionPlan()` — maps the whole plan once it's finalised.
- `generateOneMorePersonalAction()` and `app/api/generate-actions-batch/route.ts` — maps newly inserted actions in plans that already have boxes enabled.
- Editing an upcoming action's title/how/why (`actions-client.tsx` → its server action) — re-maps that one action if it hasn't been unlocked yet.

**Pure helpers** (`lib/surprise-boxes.ts`, tested in `lib/__tests__/surprise-boxes.test.ts`): parsing and validating the matcher response, the variety-preserving fallback assignment, box state (`opened | ready | next | locked`), halfway/finale slots.

## 5. Server actions

**`app/actions/surprise-boxes.ts`**
- `getMySurpriseShelf(cohortId)` — `enabled` flag, one entry per plan action in schedule order with its state and (for unlocked ones) resource details.
- `markSurpriseBoxOpened(unlockId)`.

**`app/actions/surprise-box-resources.ts`** (superadmin only)
- `listSurpriseResources()`, `createSurpriseResource()`, `updateSurpriseResource()`, `setSurpriseResourceActive()`.
- `uploadSurpriseResourceFile()` / `uploadSurpriseResourceThumbnail()` to the new bucket via the service role (pattern: `lib/trainer-image-upload.ts`).

**`completeAction()`** (`app/actions/user-actions.ts`)
- After any successful settlement of a personal wallet action, call `unlock_my_surprise_box` and return `surpriseBoxUnlockId`.
- Non-fatal: if it fails, log and still return success.

## 6. Super admin — `app/(app)/superadmin/surprise-boxes/`

- New tab in the superadmin shell: **Surprise Boxes**.
- List: title, kind, source, description preview, active toggle, how many actions it's mapped to. A banner while fewer than **30 active** resources exist (warning, not a block).
- Create/edit form: title, description (with a hint that it drives matching), kind, **Upload file** or **Paste link**, optional thumbnail, duration label.
- Deactivate rather than delete once a resource is mapped.

## 7. Animations

Assets already generated in `public/loader/`:

| File | Use | Length |
|---|---|---|
| `nudgie-dance.gif` | `/auth/callback` after the email click | 3.2 s |
| `nudgie-door.gif` | Signing in (Layout loader) | 7.2 s (card-tap section repeated) |
| `nudgie-notebook.gif` | Saving the action | 7.3 s (writing slowed) |
| `nudgie-joy.webp` | Cut-out beside the reveal popup (no arrow, stars kept) | loops |

- **`components/PageLoader.tsx`** — replace themes `email-signin` / `email-complete` with `email-dance`, `email-door`, `email-notebook`; add `?play=<timestamp>` to the `src` so each step starts from frame one.
- **`lib/email-link-sequence.ts`** — keeps `{ phase, startedAt }` in `sessionStorage` (the callback does a full reload into `/actions`) and exposes `waitForMinimum(phase)`, so each animation plays to the end. Minimums live in one constant.
- **`app/auth/callback/page.tsx`** — `email-dance`; redirect after `setSession` and the dance minimum.
- **`components/Layout.tsx`** — when `fromEmailLink`, `email-door` until the page is ready and the door minimum has passed.
- **`actions-client.tsx`** — `autoCompleting` overlay and in-app "I did it" use `email-notebook`.
- Delete `nudgie-email-signin.gif`, `nudgie-email-complete.gif` and `nudgie-cheer.webp` once unused.

## 8. Participant UI

**Wallet page (`app/(app)/wallet/page.tsx`)** — new full-width **Surprise Boxes** section between the score/bank grid and the tree milestones.
- One box per plan action in schedule order; 6 per row on desktop, 4 on tablet, 3 on phones; progress bar with ⭐ halfway and 🏆 finale markers (visual highlight only — they hold their action's mapped resource like any other box).
- States: **opened** (resource card, click to view again), **ready to open** (unlocked but popup was closed early), **next up**, **locked** (incl. missed actions, which unlock if completed late).
- **Plans without boxes enabled (existing cohorts):** the section shows every box locked with "Surprise Boxes start with your next programme." and no reveal.
- Reads `searchParams.reveal` (one or more unlock ids), opens the reveal, then strips the param.

**New components**
- `components/SurpriseBoxShelf.tsx` — shelf and tiles.
- `components/SurpriseReveal.tsx` — popup with the CSS gift box, tap to open, resource card (link to `external_url` or the bucket file URL; videos and PDFs open in a new tab), queue for multiple boxes, confetti, joy Nudgie + speech bubble (beside the popup on desktop, above it on phones). Calls `markSurpriseBoxOpened`.
- Styles in `app/globals.css` with the existing tokens and `wallet-*` naming; follow `docs/nudgeable-design-rulebook.md`; respect `prefers-reduced-motion`.

**Actions page** — when `completeAction()` returns `surpriseBoxUnlockId`, skip `ConfettiCelebration` and `router.replace("/wallet?reveal=<ids>")`. `ConfettiCelebration` stays for plans without boxes enabled.

## 9. Email (last, optional)

Reminder email action card (`lib/email-templates.ts`, `nudgieActionCardHtml`): "🎁 Mark done to open your Surprise Box" — only for recipients whose plan has boxes enabled.

## 10. Delivery order (one PR each)

1. Migration: bucket, tables, columns, functions, RLS, purge update, data-model doc.
2. Super admin library page + upload actions (so the 30+ resources can be loaded before launch).
3. Resource matcher + pure helpers + tests; hook into plan activation, new actions and edits.
4. `completeAction()` unlock + wallet shelf + reveal (testable via `?reveal=`).
5. Animation themes, email-link sequence, actions-page redirect.
6. Email teaser; delete old GIFs; move the prototype.

## 11. Testing

- **Unit (`npx vitest run`):** matcher response parsing (out-of-range indexes, missing actions), variety-preserving fallback with 12 actions / 30 resources and 40 actions / 30 resources, box states.
- **Database (staging Supabase):** unlock twice → one row; bulk unlock of 3 → 3 rows; late completion unlocks; old plan (`surprise_boxes_enabled = false`) never unlocks; other users can't read your unlocks; purge removes them; upload/read in the new bucket; non-superadmin can't write resources.
- **Matcher:** run against a real finalised staging plan and eyeball the 12 mappings; force a failure and confirm the unlock fallback still fills the box.
- **End to end:** test reminder email from Superadmin → Emails → "Mark done" on desktop and phone; Friday "I completed all"; in-app "I did it"; Pending validation; late completion; an existing-cohort account (locked shelf, old popup); all boxes opened.
- **Timing:** each animation plays to the end, on a fast connection and on throttled "Slow 4G".

## 12. Housekeeping

- `public/prototypes/surprise-box.html` is served publicly by the live site — move it to `docs/prototypes/` before merging.
- `.claude/launch.json` has a local `prototypes` static-server entry; keep or revert.
- **Upload size:** Supabase Storage caps file size by plan (50 MB on Free). Large videos should be links (YouTube/Vimeo) or the bucket limit raised.

## 13. Open questions

1. Can a participant **re-open** an opened resource any time from the shelf? (Plan assumes yes.)
2. Should the **halfway/finale** boxes get special content chosen by super admin, or stay visual highlights only? (Plan assumes highlights only.)
3. Should **company admins / trainers** see which resource each participant got, or is this participant-only for now? (Plan assumes participant-only.)
