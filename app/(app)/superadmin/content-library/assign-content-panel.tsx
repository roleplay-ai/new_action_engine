"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { listCohorts } from "@/app/actions/cohorts";
import { assignContentToCohort } from "@/app/actions/prepare-content";
import type { PrepareContentItem } from "@/lib/types";
import { SelectCompanyPrompt, useSuperadminCompany } from "../superadmin-company-context";

type CohortOption = { id: string; name: string };

export default function AssignContentPanel({ items }: { items: PrepareContentItem[] }) {
  // Company comes from the console-wide selector in the top bar.
  const { companies, companyId } = useSuperadminCompany();
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);
  const [cohortId, setCohortId] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [cohortsLoading, setCohortsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setCohorts([]);
      setCohortId("");
      return;
    }
    let cancelled = false;
    setCohortsLoading(true);
    setError(null);
    setCohortId("");
    (async () => {
      try {
        const result = await listCohorts(companyId);
        if (cancelled) return;
        if (result.error) {
          setCohorts([]);
          setError(result.error);
          return;
        }
        setCohorts(result.cohorts ?? []);
        setCohortId((result.cohorts ?? [])[0]?.id ?? "");
      } finally {
        if (!cancelled) setCohortsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  function toggleItem(id: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAssign() {
    if (!cohortId || selectedItemIds.size === 0) return;
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const result = await assignContentToCohort(cohortId, Array.from(selectedItemIds));
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess("Content assigned successfully.");
      setSelectedItemIds(new Set());
    } finally {
      setLoading(false);
    }
  }

  const activeItems = items.filter((i) => i.isActive);

  if (companies.length === 0) {
    return <p className="text-sm text-slate-500">Create a company first.</p>;
  }

  if (!companyId) {
    return <SelectCompanyPrompt message="Choose a company in the top bar to assign content to one of its batches." />;
  }

  return (
    <div className="superadmin-assignment-card">
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={cohortId}
          onChange={(e) => setCohortId(e.target.value)}
          disabled={cohortsLoading || cohorts.length === 0}
          className="flex-1 px-3 py-2 border-2 border-black rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {cohortsLoading || cohorts.length === 0 ? (
            <option value="">{cohortsLoading ? "Loading batches…" : "No batches in this company"}</option>
          ) : (
            cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))
          )}
        </select>
      </div>

      {activeItems.length === 0 ? (
        <p className="text-sm text-slate-500">No active content items yet.</p>
      ) : (
        <ul className="divide-y divide-slate-200 border-2 border-black rounded-lg overflow-hidden">
          {activeItems.map((item) => (
            <li key={item.id} className="flex items-center gap-3 p-3">
              <input
                type="checkbox"
                checked={selectedItemIds.has(item.id)}
                onChange={() => toggleItem(item.id)}
                className="h-5 w-5 accent-black cursor-pointer flex-shrink-0"
                aria-label={item.title}
              />
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">{item.type}</span>
              <span className="text-sm font-semibold">{item.title}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={handleAssign}
        disabled={loading || !cohortId || selectedItemIds.size === 0}
        className="superadmin-submit"
      >
        {loading && <Loader2 size={14} className="animate-spin" />}{loading ? "Assigning" : `Assign ${selectedItemIds.size || ""}`}
      </button>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
      {success && <p className="text-xs font-bold text-emerald-600">{success}</p>}
    </div>
  );
}
