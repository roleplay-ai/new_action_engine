"use client";

import { Search, X } from "lucide-react";

type FilterableEntry = {
  cohortId: string;
  cohortName: string;
  batchName: string | null;
  fullName: string | null;
  email: string;
};

export type BatchOption = { id: string; label: string };

function batchLabel(entry: FilterableEntry) {
  return entry.batchName && entry.batchName !== entry.cohortName
    ? `${entry.cohortName} · ${entry.batchName}`
    : entry.cohortName;
}

export function getBatchOptions(entries: FilterableEntry[]): BatchOption[] {
  const options = new Map<string, string>();
  for (const entry of entries) {
    if (!options.has(entry.cohortId)) options.set(entry.cohortId, batchLabel(entry));
  }
  return Array.from(options, ([id, label]) => ({ id, label })).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
}

export function filterQueueEntries<T extends FilterableEntry>(
  entries: T[],
  batchId: string,
  search: string
): T[] {
  const query = search.trim().toLowerCase();
  return entries.filter((entry) => {
    if (batchId && entry.cohortId !== batchId) return false;
    if (!query) return true;
    return (
      (entry.fullName ?? "").toLowerCase().includes(query) ||
      entry.email.toLowerCase().includes(query)
    );
  });
}

export default function EmailQueueFilters({
  batches,
  batchId,
  onBatchChange,
  search,
  onSearchChange,
}: {
  batches: BatchOption[];
  batchId: string;
  onBatchChange: (batchId: string) => void;
  search: string;
  onSearchChange: (search: string) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
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
      <select
        value={batchId}
        onChange={(event) => onBatchChange(event.target.value)}
        aria-label="Filter by batch"
        className="min-w-[200px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-500"
      >
        <option value="">All batches</option>
        {batches.map((batch) => (
          <option key={batch.id} value={batch.id}>
            {batch.label}
          </option>
        ))}
      </select>
    </div>
  );
}
