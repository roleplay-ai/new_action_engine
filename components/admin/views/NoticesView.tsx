"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Megaphone, Search, Users, X } from "lucide-react";
import { useSelectedAdminBatch } from "@/components/admin/AdminContext";
import NoticesClient from "@/components/trainer/NoticesClient";
import { fetchAdminJson, isAbortError } from "@/lib/admin-fetch";
import type { Cohort, CohortNotice } from "@/lib/types";

interface NoticesViewProps {
  companyId: string | null;
}

function initials(value: string) {
  const words = (value || "Batch").trim().split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase()).join("") || "B";
}

function NoticesWorkspace({ cohortId }: { cohortId: string }) {
  const [notices, setNotices] = useState<CohortNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchAdminJson<{ error?: string; notices?: CohortNotice[] }>(
          `/api/admin/cohorts/${encodeURIComponent(cohortId)}?bundle=notices`,
          controller.signal
        );
        if (controller.signal.aborted) return;
        if (result.error) {
          setError(result.error);
          setNotices([]);
        } else {
          setNotices(result.notices ?? []);
        }
      } catch (caughtError) {
        if (isAbortError(caughtError) || controller.signal.aborted) return;
        setError(caughtError instanceof Error ? caughtError.message : "Could not load notices");
        setNotices([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [cohortId]);

  if (loading) {
    return (
      <div className="cohort-admin-detail-loading" aria-busy="true">
        <Loader2 size={20} className="cohort-admin-spin" /><span>Loading notices…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cohort-admin-alert cohort-admin-alert--error cohort-admin-alert--inner" role="alert">
        <AlertCircle size={17} />
        <div><strong>Could not load notices</strong><span>{error}</span></div>
      </div>
    );
  }

  return <NoticesClient cohortId={cohortId} initialNotices={notices} />;
}

export function NoticesView({ companyId }: NoticesViewProps) {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const { selectedCohortId, setSelectedCohortId, selectedCohort } = useSelectedAdminBatch(cohorts);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAdminJson<{ error?: string; cohorts?: Cohort[] }>(
        `/api/admin/cohorts?companyId=${encodeURIComponent(companyId)}`,
        signal
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setCohorts(result.cohorts ?? []);
    } catch (caughtError) {
      if (isAbortError(caughtError)) return;
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load batches");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    const controller = new AbortController();
    setCohorts([]);
    setQuery("");
    void refresh(controller.signal);
    return () => controller.abort();
  }, [companyId, refresh]);

  const filteredCohorts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return cohorts;
    return cohorts.filter((cohort) =>
      `${cohort.batchName} ${cohort.moduleName ?? ""}`.toLowerCase().includes(needle)
    );
  }, [cohorts, query]);

  if (!companyId) return null;

  return (
    <section className="cohort-admin-page">
      <header className="cohort-admin-header">
        <div>
          <div className="cohort-admin-company-heading">
            <span><Megaphone size={22} /></span>
            <div><h1>Announcements</h1><strong>Batch announcements</strong></div>
          </div>
          <p>Post dated announcements to a batch. They appear here and on every participant&apos;s Base Camp page.</p>
        </div>
      </header>

      {error && (
        <div className="cohort-admin-alert cohort-admin-alert--error" role="alert">
          <AlertCircle size={18} />
          <div><strong>Something went wrong</strong><span>{error}</span></div>
          <button type="button" onClick={() => void refresh()}>Try again</button>
        </div>
      )}

      <div className="cohort-admin-layout">
        <aside className="cohort-admin-directory">
          <div className="cohort-admin-directory-head">
            <div><h2>Batches</h2><span>{cohorts.length} active</span></div>
            <label className="cohort-admin-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search batches"
                aria-label="Search batches"
              />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
            </label>
          </div>

          {loading && cohorts.length === 0 ? (
            <div className="cohort-admin-detail-loading" aria-busy="true">
              <Loader2 size={20} className="cohort-admin-spin" /><span>Loading batches…</span>
            </div>
          ) : cohorts.length === 0 ? (
            <div className="cohort-admin-empty">
              <span><Users size={23} /></span>
              <h3>No batches yet</h3>
              <p>Create a batch in Batch management first.</p>
            </div>
          ) : filteredCohorts.length === 0 ? (
            <div className="cohort-admin-empty cohort-admin-empty--compact">
              <h3>No matching batches</h3>
              <p>Try a different name.</p>
              <button type="button" onClick={() => setQuery("")}>Clear search</button>
            </div>
          ) : (
            <div className="cohort-admin-list">
              {filteredCohorts.map((cohort) => {
                const selected = selectedCohortId === cohort.id;
                return (
                  <button
                    type="button"
                    key={cohort.id}
                    className={`cohort-admin-row${selected ? " cohort-admin-row--selected" : ""}`}
                    onClick={() => setSelectedCohortId(cohort.id)}
                    aria-current={selected ? "true" : undefined}
                  >
                    <span className="cohort-admin-cohort-mark">{cohort.logoUrl ? <img src={cohort.logoUrl} alt="" /> : initials(cohort.batchName)}</span>
                    <span className="cohort-admin-row-copy">
                      <span className="cohort-admin-row-name-line"><strong>{cohort.batchName}</strong></span>
                      {cohort.moduleName && <span className="cohort-admin-row-module">{cohort.moduleName}</span>}
                      <span className="cohort-admin-row-meta">
                        <span><Users size={12} /> {cohort.memberCount}</span>
                        {cohort.trainer?.name && <span>{cohort.trainer.name}</span>}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <main className="cohort-admin-workspace">
          {selectedCohort ? (
            <div className="cohort-admin-trainer-panel" key={selectedCohort.id}>
              <NoticesWorkspace cohortId={selectedCohort.id} />
            </div>
          ) : (
            <div className="cohort-admin-placeholder">
              <span><Megaphone size={25} /></span>
              <h2>Select a batch</h2>
              <p>Choose a batch to post or remove announcements on its notice board.</p>
            </div>
          )}
        </main>
      </div>
    </section>
  );
}
