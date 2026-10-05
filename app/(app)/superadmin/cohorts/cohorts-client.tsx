"use client";

import { AdminPageClient } from "../../admin/admin-page-client";
import { SelectCompanyPrompt, useSuperadminCompany } from "../superadmin-company-context";

/** Batch management, scoped to the company picked in the top bar. */
export default function SuperadminCohortsClient({ companyId }: { companyId: string | null }) {
  const { companies, companyId: selectedCompanyId, hydrated } = useSuperadminCompany();

  if (!hydrated) return null;
  if (!selectedCompanyId) {
    return <SelectCompanyPrompt message="Choose a company in the top bar to manage its batches." />;
  }

  return (
    <AdminPageClient
      companies={companies}
      role="superadmin"
      companyId={companyId}
      view="cohort-management"
      controlledCompanyId={selectedCompanyId}
    />
  );
}
