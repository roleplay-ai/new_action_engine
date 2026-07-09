"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

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
}

const AdminContext = createContext<AdminContextType | null>(null);

export function useAdminContext() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error("useAdminContext must be used within AdminContextProvider");
  }
  return context;
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
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  useEffect(() => {
    if (role === "superadmin" && companies.length > 0 && !selectedCompanyId) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [role, companies, selectedCompanyId]);

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
    <div className="card--flat rounded-2xl p-4" style={{ border: "1px solid var(--color-border-yellow)", background: "var(--color-bg-muted)", boxShadow: "var(--shadow-sm)" }}>
      <label className="form-label block mb-2" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
        Company context <span style={{ color: "var(--color-text-accent)", fontWeight: 700 }}>· Superadmin</span>
      </label>
      <select
        value={selectedCompanyId ?? ""}
        onChange={(e) => setSelectedCompanyId(e.target.value || null)}
        className="form-input w-full max-w-md"
        style={{ fontSize: "var(--text-sm)" }}
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
