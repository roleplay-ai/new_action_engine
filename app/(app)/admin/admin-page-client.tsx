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
  PackageManagementView,
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
  | "package-management"
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
      {view === "package-management" && (
        <PackageManagementView companyId={effectiveCompanyId} role={role} />
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
