"use client";

import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import { getBatchOptions, type BatchOption } from "@/app/actions/admin-dashboard";

interface BatchSelectorProps {
  companyId: string | null;
  /** null = "All batches" (consolidated). */
  value: string | null;
  onChange: (cohortId: string | null) => void;
}

/** Dropdown feeding the Dashboard's batch drill-down sections. Each option is labeled
 * "{batchName} — {moduleName}" (module is an attribute of the batch, not an independent
 * filter), with a default "All batches" option for the consolidated view. */
export function BatchSelector({ companyId, value, onChange }: BatchSelectorProps) {
  const [options, setOptions] = useState<BatchOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) {
      setOptions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    getBatchOptions(companyId)
      .then(({ options }) => setOptions(options ?? []))
      .finally(() => setLoading(false));
  }, [companyId]);

  return (
    <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-sm)" }}>
      <Layers size={15} strokeWidth={2} style={{ color: "var(--color-text-muted)" }} />
      <select
        value={value ?? ""}
        disabled={loading || !companyId}
        onChange={(e) => onChange(e.target.value || null)}
        className="text-sm font-semibold bg-transparent outline-none cursor-pointer"
        style={{ color: "var(--color-text-primary)" }}
      >
        <option value="">All batches (consolidated)</option>
        {options.map((opt) => (
          <option key={opt.cohortId} value={opt.cohortId}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
