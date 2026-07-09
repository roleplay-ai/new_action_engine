# Nudgeable Action Engine — Documentation

Technical + feature-level documentation describing the app **as it is actually implemented today**, verified directly against the source code and all Supabase migrations (not the earlier planning docs in the repo root / `plans/`, which describe an earlier design and have drifted from what's actually built — see the "Known dead code" section below for specifics).

## Contents

1. [Architecture Overview](./00-architecture-overview.md) — tech stack, roles & multi-tenancy, how authorization actually works, high-level data flow, auth mechanisms summary, and a list of dead/inert code worth knowing about before you go looking for it.
2. [User Guide](./01-user-guide.md) — the regular end-user experience: login, action library, scheduling, validation, the 5-rep habit loop, points/XP, leagues, leaderboard, personal analytics.
3. [Company Admin Guide](./02-admin-guide.md) — the `admin` panel: dashboard analytics, action CRUD, package creation & deployment, company user management, credential email sending.
4. [Superadmin Guide](./03-superadmin-guide.md) — the `superadmin` panel: company management, global user management, auto-login infrastructure, credential delivery, email scheduling, and the platform's one cron job.
5. [Data Model & Auth Internals](./04-data-model.md) — full database schema (final state after all 20 migrations), enums, RLS policies, functions/triggers, middleware behavior, and cron configuration.

## How to read this set

Each guide is self-contained for its audience but cross-links to the others where behavior spans roles (e.g. how a package an admin deploys becomes visible on a user's dashboard). Start with the Architecture Overview if you're new to the codebase — it explains the role model and flags several components/functions that exist in the repo but are not actually reachable or functional, so you don't mistake them for real behavior while reading the rest.

## Source of truth

Older docs in this repo (`PRODUCT_GUIDE.md`, `ENGINE_BLUEPRINT.md`, `docs/MULTI_TENANT_DESIGN.md`, `plans/PHASE_*.md`) were the original design proposals. Where they conflict with this documentation set, **this set is correct** — it was produced by reading the live implementation, not the plans. Notable gaps between plan and reality (e.g. no onboarding flow, no live calendar OAuth integration, no working social feed, package "rule of five"/"actions per week" fields never built) are called out explicitly in [00-architecture-overview.md](./00-architecture-overview.md#6-known-dead-code--inert-features) rather than left for someone to discover the hard way.
