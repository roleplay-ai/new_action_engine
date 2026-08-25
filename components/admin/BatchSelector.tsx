"use client";

import { useEffect, useRef, useState } from "react";
import { Layers } from "lucide-react";
import { fetchAdminJson, isAbortError } from "@/lib/admin-fetch";

interface BatchSelectorProps {
  companyId: string | null;
  /** null = "All batches" (consolidated). */
  value: string | null;
  onChange: (cohortId: string | null) => void;
}

type BatchOption = { cohortId: string; label: string };

/** Shared admin batch dropdown. Each option is labeled
 * "{batchName} — {moduleName}". Defaults to the newest batch; "All batches"
 * remains available for a consolidated view. */
export function BatchSelector({ companyId, value, onChange }: BatchSelectorProps) {
  const [options, setOptions] = useState<BatchOption[]>([]);
  const [loading, setLoading] = useState(true);
  /** True only after the user explicitly picks "All batches" for this company. */
  const allowAllRef = useRef(false);

  useEffect(() => {
    allowAllRef.current = false;
  }, [companyId]);

  useEffect(() => {
    if (!companyId) {
      setOptions([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetchAdminJson<{ options?: BatchOption[] }>(
      `/api/admin/batch-options?companyId=${encodeURIComponent(companyId)}`,
      controller.signal
    )
      .then(({ options: nextOptions }) => {
        if (!controller.signal.aborted) setOptions(nextOptions ?? []);
      })
      .catch((error) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        setOptions([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [companyId]);

  useEffect(() => {
    if (options.length === 0) return;
    if (value && options.some((opt) => opt.cohortId === value)) return;
    // Keep an intentional "All batches" choice; otherwise default to the
    // newest batch (API returns created_at desc — same as Batch Management).
    if (value === null && allowAllRef.current) return;
    onChange(options[0].cohortId);
  }, [options, value, onChange]);

  return (
    <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-sm)" }}>
      <Layers size={15} strokeWidth={2} style={{ color: "var(--color-text-muted)" }} />
      <select
        value={value ?? ""}
        disabled={loading || !companyId}
        onChange={(e) => {
          const next = e.target.value || null;
          allowAllRef.current = next === null;
          onChange(next);
        }}
        className="text-sm font-semibold bg-transparent outline-none cursor-pointer"
        style={{ color: "var(--color-text-primary)" }}
        aria-label="Batch"
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
