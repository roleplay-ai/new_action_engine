"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, MessageSquareText, Search, Users, X } from "lucide-react";
import { listCohorts } from "@/app/actions/cohorts";
import { useSelectedAdminBatch } from "@/components/admin/AdminContext";
import CohortChat from "@/components/journey/CohortChat";
import type { Cohort } from "@/lib/types";

interface ConversationsViewProps {
  companyId: string | null;
}

function initials(value: string) {
  const words = (value || "Batch").trim().split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase()).join("") || "B";
}

export function ConversationsView({ companyId }: ConversationsViewProps) {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const { selectedCohortId, setSelectedCohortId, selectedCohort } = useSelectedAdminBatch(cohorts);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listCohorts(companyId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setCohorts(result.cohorts ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load batches");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setCohorts([]);
    setQuery("");
    void refresh();
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
    <section className="cohort-admin-page cohort-admin-page--fill">
      <header className="cohort-admin-header">
        <div>
          <div className="cohort-admin-company-heading">
            <span><MessageSquareText size={22} /></span>
            <div><h1>Conversations</h1><strong>Batch conversations</strong></div>
          </div>
          <p>Read and join any batch&apos;s conversation with its participants and trainer.</p>
        </div>
      </header>

      {error && (
        <div className="cohort-admin-alert cohort-admin-alert--error" role="alert">
          <AlertCircle size={18} />
          <div><strong>Something went wrong</strong><span>{error}</span></div>
          <button type="button" onClick={() => void refresh()}>Try again</button>
        </div>
      )}

      <div className="cohort-admin-layout cohort-admin-layout--chat">
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
            <div className="cohort-admin-chat-shell" key={selectedCohort.id}>
              <CohortChat cohortId={selectedCohort.id} />
            </div>
          ) : (
            <div className="cohort-admin-placeholder">
              <span><MessageSquareText size={25} /></span>
              <h2>Select a batch</h2>
              <p>Choose a batch to read and join its conversation.</p>
            </div>
          )}
        </main>
      </div>
    </section>
  );
}
