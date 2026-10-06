"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { BatchModuleSelects, useBatchOptions, type BatchOption } from "@/components/admin/BatchSelector";
import { useSuperadminCompany } from "./superadmin-company-context";

type FilterableEntry = {
  cohortId: string;
  fullName: string | null;
  email: string;
};

/** The batch + module filter for an email queue, scoped to the company
 * chosen in the top bar. `scope` is the set of batch-modules whose
 * participants may show: the picked one, else every one of the company's,
 * or null (no filter) while no company is chosen. */
export function useQueueBatchFilter() {
  const companyId = useSuperadminCompany().companyId || null;
  const { options, loading } = useBatchOptions(companyId);
  const [batchId, setBatchId] = useState<string | null>(null);

  // A batch picked under one company means nothing once the company changes.
  useEffect(() => {
    setBatchId(null);
  }, [companyId]);

  const scope = useMemo(
    () => (batchId ? new Set([batchId]) : companyId ? new Set(options.map((option) => option.cohortId)) : null),
    [batchId, companyId, options]
  );
  return { companyId, options, loading, batchId, setBatchId, scope };
}

export function filterQueueEntries<T extends FilterableEntry>(
  entries: T[],
  scope: Set<string> | null,
  search: string
): T[] {
  const query = search.trim().toLowerCase();
  return entries.filter((entry) => {
    if (scope && !scope.has(entry.cohortId)) return false;
    if (!query) return true;
    return (
      (entry.fullName ?? "").toLowerCase().includes(query) ||
      entry.email.toLowerCase().includes(query)
    );
  });
}

export default function EmailQueueFilters({
  idPrefix,
  companyId,
  batches,
  batchesLoading,
  batchId,
  onBatchChange,
  search,
  onSearchChange,
}: {
  idPrefix: string;
  companyId: string | null;
  batches: BatchOption[];
  batchesLoading: boolean;
  batchId: string | null;
  onBatchChange: (batchId: string | null) => void;
  search: string;
  onSearchChange: (search: string) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end gap-2">
      <label className="relative min-w-[220px] flex-1">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search members by name or email"
          aria-label="Search members"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm text-slate-800 outline-none focus:border-slate-500"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </label>
      {companyId ? (
        <BatchModuleSelects
          idPrefix={idPrefix}
          options={batches}
          loading={batchesLoading}
          value={batchId}
          onChange={onBatchChange}
          allowAll
        />
      ) : (
        <span className="text-xs font-semibold text-slate-500">Choose a company in the top bar to filter by batch and module.</span>
      )}
    </div>
  );
}
