# Phase 2a: Company Admin – Action CRUD, packages, analytics

**Planning source:** [PRODUCT_GUIDE.md](../PRODUCT_GUIDE.md) | **Multi-tenant:** [docs/MULTI_TENANT_DESIGN.md](../docs/MULTI_TENANT_DESIGN.md) | **Overview:** [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md)

**Goal:** **Company Admin** (role = 'admin', with company_id) can: (1) **Action CRUD** – create, read, update, delete actions for their company; (2) create **packages** and assign them to users in their company (Deploy & Enrol); (3) view **analytics dashboard** scoped to their company. Superadmin can do the same for any company (or pick company context).

---

## 2a.1 Action CRUD (company-scoped)

- **List actions:** Only actions where `company_id` = current user’s `company_id` (or for superadmin: filter by selected company).
- **Create action:** Server Action `createAction(theme, title, how, why, points, time_estimate)`; set `company_id` = current user’s company_id (and `created_by` = current user). Restrict to role 'admin' or 'superadmin'.
- **Update action:** Server Action `updateAction(id, ...)`; only if action.company_id = user’s company_id (or superadmin).
- **Delete action:** Server Action `deleteAction(id)`; only if action.company_id = user’s company_id. Consider impact on existing user_actions (block delete if in use, or cascade/soft delete per product).
- **UI:** “Action Library” or “Custom Action Architect” in Admin Dashboard; table/list with Edit/Delete; form for Create/Edit. Use existing [AdminDashboard](../components/AdminDashboard.tsx) “Architect New Action” and extend to full CRUD.

## 2a.2 Packages (company-scoped)

- **Schema:** `packages` has **company_id** (FK companies). `package_actions`, `package_assignments` unchanged.
- **Create package:** Set `company_id` = current user’s company_id; select only actions that belong to that company.
- **Deploy & Enrol:** Select only **users in the same company** (profiles where company_id = my company_id); create package_assignments and user_actions for those users.
- **UI:** Control Panel (Architect Wizard) – Architect Content (select company actions), Pulse Logic, Deploy & Enrol (user picker/CSV limited to company users). Restrict route to role 'admin' or 'superadmin'.

## 2a.3 Analytics dashboard (company-scoped)

- **Scope:** All metrics for **current user’s company only**: users (profiles where company_id = my company_id), actions (company_id = my company_id), adoption index, funnel, skill drivers.
- **UI:** [AdminDashboard](../components/AdminDashboard.tsx) – Analyze Change, Action Performance, User Engagement tabs; data from Supabase filtered by company_id. Export (company data only).

## 2a.4 Access control

- Middleware or layout: `/admin` (and company admin routes) allowed only for `role IN ('admin', 'superadmin')`. If role 'admin', all queries and mutations scoped to their `company_id`.
- Superadmin: can optionally “impersonate” or select a company context to see that company’s admin view.

---

## Deliverables

- Action CRUD (create, read, update, delete) for company-scoped actions.
- Packages schema with company_id; create package and assign to company users only.
- Analytics dashboard scoped to company (users, actions, funnel, export).
- Role-based access for company admin and superadmin.

---

## File and folder hints

- `supabase/migrations/003_packages.sql` (add company_id to packages), `app/actions/actions.ts` (createAction, updateAction, deleteAction), `app/actions/packages.ts`, `app/actions/admin-analytics.ts` (company-scoped queries), Control Panel and Analytics UI in AdminDashboard.

---

**Prev:** [PHASE_1_ACTION_ENGINE.md](PHASE_1_ACTION_ENGINE.md) | **Next:** [PHASE_2b_SUPERADMIN_PANEL.md](PHASE_2b_SUPERADMIN_PANEL.md)
