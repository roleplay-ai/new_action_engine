"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Eye, EyeOff, Search, X } from "lucide-react";
import type { StoredCredentialRow } from "@/app/actions/superadmin-credentials";
import { useBatchOptions } from "@/components/admin/BatchSelector";
import { useSuperadminCompany } from "../superadmin-company-context";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — nothing to do.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="credential-icon-button"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={`Copy ${label}`}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function PasswordCell({ password }: { password: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="credential-cell">
      <code>
        {visible ? password : "•".repeat(Math.min(Math.max(password.length, 8), 14))}
      </code>
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        className="credential-icon-button"
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <CopyButton value={password} label="password" />
    </div>
  );
}

export default function CredentialsClient({ rows }: { rows: StoredCredentialRow[] }) {
  const { companyId } = useSuperadminCompany();
  const [search, setSearch] = useState("");
  const [batchName, setBatchName] = useState("");
  const [cohortId, setCohortId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleRow(userId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (!next.delete(userId)) next.add(userId);
      return next;
    });
  }

  const scopedRows = useMemo(
    () => (companyId ? rows.filter((row) => row.companyId === companyId) : rows),
    [rows, companyId]
  );

  // The top-bar company's batches and modules (same list as the rest of the
  // console), so every batch is offered even before anyone in it has a login.
  const { options, loading: optionsLoading } = useBatchOptions(companyId || null);

  const batchNames = useMemo(
    () => [...new Set(options.map((option) => option.batchName))].sort((a, b) => a.localeCompare(b)),
    [options]
  );

  const moduleOptions = useMemo(
    () => options.filter((option) => option.batchName === batchName),
    [options, batchName]
  );

  // A batch or module picked under one company means nothing under another.
  useEffect(() => {
    setBatchName("");
    setCohortId("");
  }, [companyId]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return scopedRows.filter((row) => {
      if (batchName && !row.batches.some((batch) => batch.batchName === batchName && (!cohortId || batch.cohortId === cohortId))) {
        return false;
      }
      if (!query) return true;
      return (
        row.email.toLowerCase().includes(query) ||
        (row.fullName ?? "").toLowerCase().includes(query) ||
        (row.companyName ?? "").toLowerCase().includes(query)
      );
    });
  }, [scopedRows, search, batchName, cohortId]);

  const filtering = !!(search || batchName);

  return (
    <div>
      <div className="credential-toolbar">
        <label className="credential-search">
          <Search size={14} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by email, name or company"
            aria-label="Search credentials"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </label>
        {companyId ? (
          <>
            <select
              aria-label="Filter by batch"
              value={batchName}
              onChange={(event) => {
                setBatchName(event.target.value);
                setCohortId("");
              }}
              disabled={optionsLoading}
              className="credential-select"
            >
              <option value="">{optionsLoading ? "Loading batches…" : "All batches"}</option>
              {batchNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <select
              aria-label="Filter by module"
              value={cohortId}
              onChange={(event) => setCohortId(event.target.value)}
              disabled={!batchName}
              className="credential-select"
            >
              <option value="">{batchName ? "All modules" : "Choose a batch first"}</option>
              {moduleOptions.map((option) => (
                <option key={option.cohortId} value={option.cohortId}>{option.moduleName ?? "No module"}</option>
              ))}
            </select>
          </>
        ) : (
          <span className="credential-hint">Choose a company in the top bar to filter by batch and module.</span>
        )}
        {filtering && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setBatchName("");
              setCohortId("");
            }}
            className="superadmin-secondary-action"
          >
            Clear filters
          </button>
        )}
      </div>

      <p className="credential-count">
        Showing {filtered.length} of {scopedRows.length} {scopedRows.length === 1 ? "login" : "logins"}
      </p>

      {filtered.length === 0 ? (
        <div className="superadmin-empty">
          <strong>{scopedRows.length === 0 ? "No stored credentials" : "No matches"}</strong>
          <p>
            {scopedRows.length === 0
              ? "Credentials appear here once users are created with a password."
              : "Try a different search or clear the batch and module filters."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="credential-table">
            <thead>
              <tr className="border-b">
                <th>Name</th>
                <th>Email (login ID)</th>
                <th>Password</th>
                <th>Company</th>
                <th>Batch / module</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.userId}
                  className={`border-b align-top cursor-pointer ${selectedIds.has(row.userId) ? "is-selected" : ""}`}
                  onClick={(event) => {
                    // Copy / reveal buttons act on their own; don't also toggle the row.
                    if ((event.target as HTMLElement).closest("button")) return;
                    toggleRow(row.userId);
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                    event.preventDefault();
                    toggleRow(row.userId);
                  }}
                  tabIndex={0}
                  aria-selected={selectedIds.has(row.userId)}
                >
                  <td className="font-semibold text-slate-800">{row.fullName || "—"}</td>
                  <td>
                    <div className="credential-cell">
                      <span>{row.email}</span>
                      <CopyButton value={row.email} label="email" />
                    </div>
                  </td>
                  <td><PasswordCell password={row.password} /></td>
                  <td>{row.companyName ?? "—"}</td>
                  <td>
                    {row.batches.length ? (
                      <div className="credential-stack">
                        {row.batches.map((batch) => (
                          <span key={batch.cohortId}>
                            {batch.batchName}
                            {batch.moduleName ? ` — ${batch.moduleName}` : ""}
                          </span>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
