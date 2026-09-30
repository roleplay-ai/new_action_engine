"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Building2 } from "lucide-react";

// Same key the admin views' AdminContext uses, so a company picked here is
// also what those views restore — and clearAdminBatchSelection() clears it on
// logout, so every new session starts with no company selected.
const COMPANY_STORAGE_KEY = "nudgeable:admin:companyId";
// AdminContext's remembered batch — only valid for the company it was picked under.
const BATCH_STORAGE_KEYS = ["nudgeable:admin:cohortId", "nudgeable:admin:batchConfirmed"];

export type SuperadminCompany = { id: string; name: string; slug: string | null };

type SuperadminCompanyContextType = {
  companies: SuperadminCompany[];
  /** "" when no company is selected. */
  companyId: string;
  company: SuperadminCompany | null;
  setCompanyId: (id: string) => void;
  /** False until the remembered selection has been read from sessionStorage,
   * so pages don't briefly fetch (or show "select a company") for nothing. */
  hydrated: boolean;
};

const SuperadminCompanyContext = createContext<SuperadminCompanyContextType | null>(null);

export function useSuperadminCompany() {
  const context = useContext(SuperadminCompanyContext);
  if (!context) throw new Error("useSuperadminCompany must be used within SuperadminCompanyProvider");
  return context;
}

export function SuperadminCompanyProvider({
  companies,
  children,
}: {
  companies: SuperadminCompany[];
  children: React.ReactNode;
}) {
  const [companyId, setCompanyIdState] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(COMPANY_STORAGE_KEY);
      if (stored && companies.some((company) => company.id === stored)) setCompanyIdState(stored);
    } catch {
      // Storage unavailable — start with no company selected.
    }
    setHydrated(true);
  }, [companies]);

  const setCompanyId = useCallback((id: string) => {
    setCompanyIdState(id);
    try {
      for (const key of BATCH_STORAGE_KEYS) sessionStorage.removeItem(key);
      if (id) sessionStorage.setItem(COMPANY_STORAGE_KEY, id);
      else sessionStorage.removeItem(COMPANY_STORAGE_KEY);
    } catch {
      // Ignore — the selection still applies for this page view.
    }
  }, []);

  const company = companies.find((c) => c.id === companyId) ?? null;

  return (
    <SuperadminCompanyContext.Provider value={{ companies, companyId, company, setCompanyId, hydrated }}>
      {children}
    </SuperadminCompanyContext.Provider>
  );
}

/** The one company switcher for the whole superadmin console (top bar). */
export function SuperadminCompanySelector() {
  const { companies, companyId, setCompanyId, hydrated } = useSuperadminCompany();
  if (!companies.length) return null;

  return (
    <label className="superadmin-company-select">
      <Building2 size={15} />
      <select
        value={companyId}
        onChange={(event) => setCompanyId(event.target.value)}
        disabled={!hydrated}
        aria-label="Company"
      >
        <option value="">All companies</option>
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Shown by pages that need a specific company when none is selected. */
export function SelectCompanyPrompt({ message }: { message: string }) {
  return (
    <div className="superadmin-empty">
      <Building2 size={26} />
      <strong>Select a company</strong>
      <p>{message}</p>
    </div>
  );
}
