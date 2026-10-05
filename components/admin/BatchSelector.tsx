"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchAdminJson, isAbortError } from "@/lib/admin-fetch";

interface BatchSelectorProps {
  companyId: string | null;
  /** null = "All batches" (consolidated). */
  value: string | null;
  onChange: (cohortId: string | null) => void;
}

export type BatchOption = { cohortId: string; label: string; batchName: string; moduleName: string | null };

/** Fetches the batch/module options for a company. Shared by the top-bar
 * BatchSelector and the initial-selection picker modal so neither auto-picks
 * behind the other's back — the admin always makes an explicit choice. */
export function useBatchOptions(companyId: string | null) {
  const [options, setOptions] = useState<BatchOption[]>([]);
  const [loading, setLoading] = useState(true);

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

  return { options, loading };
}

/**
 * A batch is a batch name + module name. These two dropdowns split that pair:
 * pick the batch first, then (only when that batch has more than one module)
 * the module. `onChange` fires only once a single batch+module is known, so
 * a half-made choice never switches the page underneath the admin.
 */
export function BatchModuleSelects({
  options,
  loading,
  value,
  onChange,
  allowAll = false,
  stacked = false,
  idPrefix,
}: {
  options: BatchOption[];
  loading: boolean;
  value: string | null;
  onChange: (cohortId: string | null) => void;
  /** Offer "All batches" (value null) in the Batch dropdown — the Dashboard's consolidated view. */
  allowAll?: boolean;
  /** Labels above full-width selects (the pop-out) instead of the compact top-bar pair. */
  stacked?: boolean;
  idPrefix: string;
}) {
  const batchNames = useMemo(() => [...new Set(options.map((option) => option.batchName))], [options]);
  const selected = options.find((option) => option.cohortId === value) ?? null;
  // The batch picked in the first dropdown, even before its module is chosen.
  const [draftBatch, setDraftBatch] = useState<string | null>(selected?.batchName ?? null);
  useEffect(() => {
    setDraftBatch(selected?.batchName ?? null);
  }, [selected?.batchName]);

  const modules = draftBatch ? options.filter((option) => option.batchName === draftBatch) : [];
  const noModules = modules.length === 1 && !modules[0].moduleName;

  function pickBatch(next: string) {
    if (!next) {
      setDraftBatch(null);
      onChange(null);
      return;
    }
    setDraftBatch(next);
    const nextModules = options.filter((option) => option.batchName === next);
    // A batch with a single module (or none) is already a complete choice.
    if (nextModules.length === 1) onChange(nextModules[0].cohortId);
  }

  const selectClass = stacked ? "batch-picker-select batch-picker-select--stacked" : "batch-picker-select";
  const moduleValue = selected && selected.batchName === draftBatch ? selected.cohortId : "";

  return (
    <div className={stacked ? "batch-picker batch-picker--stacked" : "batch-picker"} role="group" aria-label="Batch and module">
      <label className="batch-picker-field" htmlFor={`${idPrefix}-batch`}>
        <span>Batch</span>
        <select
          id={`${idPrefix}-batch`}
          className={selectClass}
          value={draftBatch ?? ""}
          disabled={loading}
          onChange={(event) => pickBatch(event.target.value)}
        >
          {allowAll ? (
            <option value="">All batches</option>
          ) : (
            <option value="" disabled>{loading ? "Loading batches…" : "Choose a batch…"}</option>
          )}
          {batchNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </label>
      <label className="batch-picker-field" htmlFor={`${idPrefix}-module`}>
        <span>Module</span>
        <select
          id={`${idPrefix}-module`}
          className={selectClass}
          value={noModules ? modules[0].cohortId : moduleValue}
          disabled={loading || !draftBatch || noModules}
          onChange={(event) => event.target.value && onChange(event.target.value)}
        >
          {!draftBatch ? (
            <option value="">{allowAll ? "All modules" : "Choose a batch first"}</option>
          ) : noModules ? (
            <option value={modules[0].cohortId}>No modules in this batch</option>
          ) : (
            <>
              <option value="" disabled>Choose a module…</option>
              {modules.map((option) => (
                <option key={option.cohortId} value={option.cohortId}>{option.moduleName}</option>
              ))}
            </>
          )}
        </select>
      </label>
    </div>
  );
}

/** The top-right batch switcher: separate Batch and Module dropdowns. Never
 * auto-selects — the initial pick always comes from the BatchPickerGate
 * pop-out; this is only for switching afterwards. */
export function BatchSelector({ companyId, value, onChange }: BatchSelectorProps) {
  const { options, loading } = useBatchOptions(companyId);
  return (
    <BatchModuleSelects
      idPrefix="topbar"
      options={options}
      loading={loading || !companyId}
      value={value}
      onChange={onChange}
      allowAll
    />
  );
}
