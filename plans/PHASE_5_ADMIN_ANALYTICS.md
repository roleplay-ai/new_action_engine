# Phase 5: Admin analytics and reporting (company-scoped)

**Planning source:** [PRODUCT_GUIDE.md](../PRODUCT_GUIDE.md) | **Multi-tenant:** [docs/MULTI_TENANT_DESIGN.md](../docs/MULTI_TENANT_DESIGN.md) | **Overview:** [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md)

**Product Guide mapping:** Admin & Architect Suite – **Analyze Change Dashboard** (Adoption Index, Global Funnel, Skill Drivers); exportable reports; benchmarking.

**Goal:** **Company Admin** analytics per Product Guide; all metrics **scoped to their company**; export (company data only). This can be implemented as part of Phase 2a (Company Admin) or as a separate phase.

---

## 5.1 Analyze Change Dashboard (Product Guide, company-scoped)

- **Multi-tenant:** All metrics for **current user’s company only** (users, actions, feed_events where company_id = my company_id).
- **High-level view of organizational health (Product Guide):**
  - **Adoption Index:** Which behaviors are embraced vs. meeting resistance – highest/lowest adoption actions by theme (company actions only).
  - **Global Funnel:** Aggregate “leakage” from Knowledge → Intention → Action → Habit; track drop-off between phases (company users only).
  - **Skill Drivers:** Organizational growth in areas like *Learning Agility* or *Trust*; aggregate by action theme (company actions only).
- Postgres views or Server Actions: action-level stats (company_id filter); user-level engagement (profiles where company_id = my company_id); funnel phase counts; theme-level aggregates.
- UI: [AdminDashboard](../components/AdminDashboard.tsx) – Action Performance, User Engagement, **Analyze Change** tabs; replace mock data with Supabase (company-scoped); keep **Neo-Brutalist** tables/charts.

## 5.2 Behavioral funnel and drivers

- Funnel phases (Product Guide): Knowledge (read), Intention (scheduled), Action (success), Habit (cemented); velocity between phases; leakage %.
- Skill Drivers: aggregate by action_theme; show adoption/resistance (highest/lowest adoption actions).
- UI: Analyze Change view – funnel cards and charts from DB.

## 5.3 Export and benchmarking

- **Export:** CSV/Excel of user engagement, action performance, or feed events **for the company only**; restrict to company admin (or superadmin for any company).
- **Benchmarking:** Company-level avg points, avg success rate; show in dashboard.

---

## Deliverables

- Analyze Change Dashboard (Adoption Index, Global Funnel, Skill Drivers); Action Performance and User Engagement from DB; export reports; benchmarking metrics; Neo-Brutalist UI preserved.

---

## File and folder hints

- `app/actions/admin-analytics.ts`, export API, dashboard queries.

---

**Prev:** [PHASE_4_SOCIAL_LAYER.md](PHASE_4_SOCIAL_LAYER.md) | **Next:** [PHASE_6_POLISH.md](PHASE_6_POLISH.md)
