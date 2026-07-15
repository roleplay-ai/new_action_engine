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
  ActionMetricsView,
  ActionManagementView,
  CohortManagementView,
  ContentManagementView,
  UserManagementView,
  EmailManagementView,
} from "@/components/admin/views";

interface Company {
  id: string;
  name: string;
  slug: string | null;
}

type ViewType =
  | "dashboard"
  | "engagement"
  | "action-metrics"
  | "action-management"
  | "cohort-management"
  | "content-management"
  | "user-management"
  | "email-management";

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
      {view === "action-metrics" && (
        <ActionMetricsView companyId={effectiveCompanyId} />
      )}
      {view === "action-management" && (
        <ActionManagementView companyId={effectiveCompanyId} role={role} />
      )}
      {view === "cohort-management" && (
        <CohortManagementView companyId={effectiveCompanyId} role={role} />
      )}
      {view === "content-management" && (
        <ContentManagementView companyId={effectiveCompanyId} role={role} />
      )}
      {view === "user-management" && (
        <UserManagementView companyId={effectiveCompanyId} role={role} />
      )}
      {view === "email-management" && (
        <EmailManagementView companyId={effectiveCompanyId} role={role} />
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
