# Phase 4: Social layer (Nudgeboard and leaderboard)

**Planning source:** [PRODUCT_GUIDE.md](../PRODUCT_GUIDE.md) | **Overview:** [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md)

**Product Guide mapping:** Social & Team Dynamics – **The Nudgeboard** (live broadcast, like, contextual statuses); **Leaderboards & Leagues** (effort-based competition).

**Goal:** Real-time Nudgeboard; leaderboard; optional Team Pulse. feed_events are already emitted in Phase 1; this phase adds Nudgeboard UI, likes, leaderboard view, and Team Pulse. **Multi-tenant:** All scoped to user’s company (same company only).

---

## 4.1 The Nudgeboard (company-scoped)

- **Multi-tenant:** Only show feed_events for users in the **same company** (join profiles, filter by company_id = current user’s company_id).
- **Product Guide:** Real-time feed of team activity for social proof and collective momentum.
- Feed: `feed_events` with joins to `profiles` (user name, avatar), filtered by company; `getFeedEvents(limit, companyId)`; subscribe via Supabase Realtime (INSERT) so new items appear without refresh.
- **Live Broadcast:** See when teammates commit (“Intent”) or “crush” (“Win”) nudges.
- **Interactions:** “Like” – add `feed_event_likes` or increment `likes` on `feed_events` with RLS; update [Nudgeboard](../components/Nudgeboard.tsx) to use Supabase and realtime.
- **Contextual Statuses (Product Guide):** Badges for “Win” (Success), “Intent” (Scheduled), “Mastered” (Cemented); map event_type to these labels in UI.

## 4.2 Leaderboards & Leagues (company-scoped)

- **Multi-tenant:** Leaderboard only includes users in the **same company** (profiles where company_id = current user’s company_id).
- **Product Guide:** Users in Leagues (Starter, Bronze, Silver, Gold, Diamond) by total XP; competition around **effort**, not just output.
- Postgres view `leaderboard` (company_id, profiles.id, full_name, total_points, rank) or Server Action that filters by company_id; [Leaderboard](../components/Leaderboard.tsx) reads from it; optional realtime refresh.

## 4.3 Team Pulse (analytics for users)

- Simple dashboard: counts (scheduled, success, habit_started, cemented) for current user; optional team-wide aggregates for admins.
- Use existing [Analytics](../components/Analytics.tsx) or [Challenges](../components/Challenges.tsx) and wire to Supabase.

---

## Deliverables

- Nudgeboard (live broadcast, likes, contextual statuses); Leaderboards & Leagues; Team Pulse from DB.

---

## File and folder hints

- Realtime subscription in Nudgeboard; `app/actions/feed.ts`; leaderboard view or API.

---

**Prev:** [PHASE_3_NOTIFICATIONS.md](PHASE_3_NOTIFICATIONS.md) | **Next:** [PHASE_5_ADMIN_ANALYTICS.md](PHASE_5_ADMIN_ANALYTICS.md)
