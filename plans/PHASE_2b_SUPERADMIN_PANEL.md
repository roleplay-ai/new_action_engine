# Phase 2b: Superadmin panel – Companies, assign users, assign admin

**Planning source:** [PRODUCT_GUIDE.md](../PRODUCT_GUIDE.md) | **Multi-tenant:** [docs/MULTI_TENANT_DESIGN.md](../docs/MULTI_TENANT_DESIGN.md) | **Overview:** [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md)

**Goal:** **Superadmin** (role = 'superadmin') has a dedicated panel to: (1) **Create and manage companies**; (2) **Assign users to a company**; (3) **Assign a user as company admin** for a company.

---

## 2b.1 Superadmin routes and access

- **Route:** e.g. `/superadmin` (or `/superadmin/companies`, `/superadmin/users`). Only accessible when `profiles.role = 'superadmin'`. Redirect others to `/` or 403.
- **UI:** Separate layout or section: “Superadmin Panel” with nav: Companies, Users / Assignments.

## 2b.2 Companies CRUD

- **List companies:** Table/cards of all companies (id, name, slug, created_at, user count optional).
- **Create company:** Form (name, optional slug). Server Action `createCompany(name, slug?)`; insert into `companies`; set `created_by` = current user (superadmin).
- **Edit company:** Form (name, slug). Server Action `updateCompany(id, name, slug?)`; only superadmin.
- **Delete company (optional):** Soft delete or hard delete; if hard delete, cascade to company_id on profiles/actions/packages (schema must support ON DELETE SET NULL or CASCADE as designed).

## 2b.3 Assign users to company

- **List users:** All profiles (or all auth.users) with current company_id and role. Filter/search by email, name, company.
- **Assign to company:** Pick user (by email or id), pick company → Server Action `assignUserToCompany(userId, companyId)`; set `profiles.company_id` = companyId for that user. If user was admin of another company, consider setting role to 'user' or leaving as-is (design: one user per one company; so moving = update company_id).
- **Remove from company:** Set `profiles.company_id` = null for that user (they lose access to company-scoped content until assigned again).

## 2b.4 Assign company admin

- **Per company:** List users in that company (profiles where company_id = X). Show current role.
- **Set as admin:** Server Action `setCompanyAdmin(userId, companyId)`; set `profiles.role` = 'admin' and `profiles.company_id` = companyId (ensure user is in that company).
- **Remove admin:** Server Action `removeCompanyAdmin(userId)`; set `profiles.role` = 'user' for that user (company_id unchanged so they remain in the company as regular user).

## 2b.5 RLS and Server Actions

- All superadmin Server Actions must verify `profiles.role = 'superadmin'` for the current user.
- RLS: allow superadmin (e.g. by role) to read/update companies and to read/update profiles (company_id, role).

---

## Deliverables

- Superadmin-only route(s) and layout.
- Companies CRUD (list, create, edit; optional delete).
- Assign users to company (list users, assign company, remove from company).
- Assign company admin (set admin, remove admin) per company.
- Access control: only role 'superadmin'.

---

## File and folder hints

- `app/superadmin/layout.tsx` (check role, redirect if not superadmin), `app/superadmin/page.tsx` or `app/superadmin/companies/page.tsx`, `app/superadmin/users/page.tsx`, `app/actions/companies.ts`, `app/actions/superadmin.ts` (assignUserToCompany, setCompanyAdmin, removeCompanyAdmin).

---

**Prev:** [PHASE_2a_COMPANY_ADMIN.md](PHASE_2a_COMPANY_ADMIN.md) | **Next:** [PHASE_3_NOTIFICATIONS.md](PHASE_3_NOTIFICATIONS.md)
