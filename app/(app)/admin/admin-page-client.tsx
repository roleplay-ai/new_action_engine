"use client";

import { useState, useEffect } from "react";
import { EngineProvider } from "@/lib/store";
import {
  AdminContextProvider,
  CompanySelector,
  NoCompanyWarning,
  useAdminContext,
} from "@/components/admin/AdminContext";
import {
  DashboardView,
  EngagementView,
  CohortManagementView,
  ContentManagementView,
  CohortAnalyticsView,
  ConversationsView,
} from "@/components/admin/views";

interface Company {
  id: string;
  name: string;
  slug: string | null;
}

type ViewType =
  | "dashboard"
  | "engagement"
  | "cohort-analytics"
  | "cohort-management"
  | "content-management"
  | "conversations";

interface AdminPageClientProps {
  companies: Company[];
  role: string;
  companyId: string | null;
  view: ViewType;
}

function AdminContent({ view }: { view: ViewType }) {
  const { effectiveCompanyId, role, userCompanyId } = useAdminContext();

  const hasAccess = effectiveCompanyId || (role === "admin" && userCompanyId);

  if (!hasAccess) {
    return null;
  }

  return (
    <EngineProvider adminCompanyId={effectiveCompanyId}>
      {view === "dashboard" && (
        <DashboardView companyId={effectiveCompanyId} />
      )}
      {view === "engagement" && (
        <EngagementView companyId={effectiveCompanyId} />
      )}
      {view === "cohort-analytics" && (
        <CohortAnalyticsView companyId={effectiveCompanyId} />
      )}
      {view === "conversations" && (
        <ConversationsView companyId={effectiveCompanyId} />
      )}
      {view === "cohort-management" && (
        <CohortManagementView companyId={effectiveCompanyId} role={role} />
      )}
      {view === "content-management" && (
        <ContentManagementView companyId={effectiveCompanyId} role={role} />
      )}
    </EngineProvider>
  );
}

export function AdminPageClient({
  companies,
  role,
  companyId,
  view,
}: AdminPageClientProps) {
  return (
    <AdminContextProvider companies={companies} role={role} companyId={companyId}>
      <div className="max-w-7xl mx-auto w-full space-y-4">
        <CompanySelector />
        <NoCompanyWarning />
        <AdminContent view={view} />
      </div>
    </AdminContextProvider>
  );
}
