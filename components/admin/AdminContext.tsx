"use client";

import React, { createContext, useContext, useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Building2 } from "lucide-react";
import { BatchSelector } from "@/components/admin/BatchSelector";

const COMPANY_STORAGE_KEY = "nudgeable:admin:companyId";
const COHORT_STORAGE_KEY = "nudgeable:admin:cohortId";

interface Company {
  id: string;
  name: string;
  slug: string | null;
}

interface AdminContextType {
  companies: Company[];
  role: string;
  userCompanyId: string | null;
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
  effectiveCompanyId: string | null;
  selectedCohortId: string | null;
  setSelectedCohortId: (id: string | null) => void;
}

const AdminContext = createContext<AdminContextType | null>(null);

export function useAdminContext() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error("useAdminContext must be used within AdminContextProvider");
  }
  return context;
}

export function useOptionalAdminContext() {
  return useContext(AdminContext);
}

/** Resolve the batch a page should show: the globally selected one when it
 * still exists, otherwise the first batch in the current company list. */
export function useSelectedAdminBatch<T extends { id: string }>(cohorts: T[]) {
  const { selectedCohortId, setSelectedCohortId } = useAdminContext();
  const activeId = useMemo(() => {
    if (selectedCohortId && cohorts.some((cohort) => cohort.id === selectedCohortId)) {
      return selectedCohortId;
    }
    return cohorts[0]?.id ?? null;
  }, [cohorts, selectedCohortId]);
  const selectedCohort = useMemo(
    () => cohorts.find((cohort) => cohort.id === activeId) ?? null,
    [cohorts, activeId]
  );
  return { selectedCohortId: activeId, setSelectedCohortId, selectedCohort };
}

interface AdminContextProviderProps {
  children: React.ReactNode;
  companies: Company[];
  role: string;
  companyId: string | null;
}

export function AdminContextProvider({
  children,
  companies,
  role,
  companyId,
}: AdminContextProviderProps) {
  const [selectedCompanyId, setSelectedCompanyIdState] = useState<string | null>(null);
  const [selectedCohortId, setSelectedCohortIdState] = useState<string | null>(null);
  const selectedCompanyIdRef = useRef<string | null>(null);
  const hydratedRef = useRef(false);
  selectedCompanyIdRef.current = selectedCompanyId;

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const storedCompany = sessionStorage.getItem(COMPANY_STORAGE_KEY);
    const storedCohort = sessionStorage.getItem(COHORT_STORAGE_KEY);
    if (role === "superadmin") {
      const nextCompany =
        storedCompany && companies.some((company) => company.id === storedCompany)
          ? storedCompany
          : companies[0]?.id ?? null;
      selectedCompanyIdRef.current = nextCompany;
      setSelectedCompanyIdState(nextCompany);
      if (nextCompany) sessionStorage.setItem(COMPANY_STORAGE_KEY, nextCompany);
    }
    if (storedCohort) setSelectedCohortIdState(storedCohort);
  }, [role, companies]);

  const setSelectedCompanyId = useCallback((id: string | null) => {
    if (selectedCompanyIdRef.current === id) return;
    selectedCompanyIdRef.current = id;
    setSelectedCompanyIdState(id);
    setSelectedCohortIdState(null);
    sessionStorage.removeItem(COHORT_STORAGE_KEY);
    if (id) sessionStorage.setItem(COMPANY_STORAGE_KEY, id);
    else sessionStorage.removeItem(COMPANY_STORAGE_KEY);
  }, []);

  const setSelectedCohortId = useCallback((id: string | null) => {
    setSelectedCohortIdState(id);
    if (id) sessionStorage.setItem(COHORT_STORAGE_KEY, id);
    else sessionStorage.removeItem(COHORT_STORAGE_KEY);
  }, []);

  const effectiveCompanyId = role === "superadmin" ? selectedCompanyId : companyId;

  return (
    <AdminContext.Provider
      value={{
        companies,
        role,
        userCompanyId: companyId,
        selectedCompanyId,
        setSelectedCompanyId,
        effectiveCompanyId,
        selectedCohortId,
        setSelectedCohortId,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export function CompanySelector() {
  const { companies, role, selectedCompanyId, setSelectedCompanyId } =
    useAdminContext();

  if (role !== "superadmin" || companies.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 min-w-0" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-sm)" }}>
      <Building2 size={15} strokeWidth={2} style={{ color: "var(--color-text-muted)" }} />
      <select
        value={selectedCompanyId ?? ""}
        onChange={(e) => setSelectedCompanyId(e.target.value || null)}
        className="text-sm font-semibold bg-transparent outline-none cursor-pointer min-w-0 max-w-xs"
        style={{ color: "var(--color-text-primary)" }}
        aria-label="Company"
      >
        <option value="">Select company…</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AdminContextBar() {
  const { companies, role, effectiveCompanyId, selectedCohortId, setSelectedCohortId } =
    useAdminContext();

  const showCompany = role === "superadmin" && companies.length > 0;
  if (!showCompany && !effectiveCompanyId) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <CompanySelector />
      {effectiveCompanyId && (
        <BatchSelector
          companyId={effectiveCompanyId}
          value={selectedCohortId}
          onChange={setSelectedCohortId}
        />
      )}
    </div>
  );
}

export function AdminShell({
  children,
  companies,
  role,
  companyId,
}: AdminContextProviderProps) {
  return (
    <AdminContextProvider companies={companies} role={role} companyId={companyId}>
      <div className="max-w-7xl mx-auto w-full space-y-4">
        <AdminContextBar />
        <NoCompanyWarning />
        {children}
      </div>
    </AdminContextProvider>
  );
}

export function NoCompanyWarning() {
  const { role, userCompanyId } = useAdminContext();

  if (role !== "admin" || userCompanyId) {
    return null;
  }

  return (
    <div className="card__inset flex items-start gap-3" style={{ borderColor: "var(--color-border-yellow)", background: "rgba(255,206,0,0.07)" }}>
      <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: "var(--bright-amber)" }} />
      <p className="text-sm font-semibold" style={{ color: "var(--color-text-accent)" }}>
        You are not assigned to a company. Contact your superadmin to get access.
      </p>
    </div>
  );
}
