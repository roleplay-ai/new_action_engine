"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Search, Users } from "lucide-react";
import { addMembersToCohort, getCohortDetail, getCompanyUsers, removeMembersFromCohort } from "@/app/actions/cohorts";
import { autoPairCommitmentBuddies } from "@/app/actions/commitment-buddies-admin";
import type { CohortMember } from "@/lib/types";
import {
  batchLabel,
  CpError,
  CpNeedBatch,
  CpPageHeader,
  CpSaveBar,
  initials,
  useConfirm,
  useControlPanelBatch,
  useReportViewReady,
  useToast,
  useUnsavedGuard,
} from "./shared";

type CompanyUser = { id: string; full_name: string | null; email: string | null; current_cohort_id: string | null };

/** Where a person is: in this batch, in another batch, or (while adding)
 * "other batch → this batch" so the move is visible before it's saved. */
function BatchPill({ thisBatch, otherBatch, state }: { thisBatch: string; otherBatch: string | null; state: "in" | "adding" | "out" }) {
  if (state === "in") return <span className="cp-pill cp-pill--ok">In this batch</span>;
  if (state === "adding") {
    return otherBatch ? (
      <span className="cp-pill cp-pill--move" title={`${otherBatch} → ${thisBatch} (not saved yet)`}>
        <span className="cp-pill-text">{otherBatch}</span>
        <ArrowRight size={12} aria-label="moving to" />
        <span className="cp-pill-text">This batch</span>
      </span>
    ) : (
      <span className="cp-pill cp-pill--ok">Added — not saved</span>
    );
  }
  return otherBatch ? <span className="cp-pill cp-pill--batch" title={otherBatch}><span className="cp-pill-text">{otherBatch}</span></span> : null;
}

export function ParticipantsPanel() {
  const { companyId, cohortId, option, options, loading: optionsLoading } = useControlPanelBatch();
  const [members, setMembers] = useState<CohortMember[]>([]);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  // The draft: people to add and people to remove when the admin saves.
  const [toAdd, setToAdd] = useState<Set<string>>(new Set());
  const [toRemove, setToRemove] = useState<Set<string>>(new Set());
  const { confirm, dialog } = useConfirm();
  const { show, toast } = useToast();

  const load = useCallback(async () => {
    if (!cohortId || !companyId) return;
    setLoading(true);
    setError(null);
    const [detail, company] = await Promise.all([getCohortDetail(cohortId), getCompanyUsers(companyId)]);
    if (detail.error || company.error) setError(detail.error || company.error || null);
    setMembers(detail.members ?? []);
    setUsers(company.users ?? []);
    setToAdd(new Set());
    setToRemove(new Set());
    setLoading(false);
  }, [cohortId, companyId]);

  useEffect(() => {
    setTicked(new Set());
    setQuery("");
    void load();
  }, [load]);

  const changes = toAdd.size + toRemove.size;
  useUnsavedGuard(changes > 0);
  useReportViewReady(!optionsLoading && !loading);

  const savedIds = useMemo(() => new Set(members.map((member) => member.id)), [members]);
  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const inDraftBatch = (id: string) => (savedIds.has(id) && !toRemove.has(id)) || toAdd.has(id);
  /** The other batch this person is in right now, if any (by its "batch — module" name). */
  const otherBatchOf = (id: string) => {
    const current = userById.get(id)?.current_cohort_id;
    if (!current || current === cohortId) return null;
    const match = options.find((item) => item.cohortId === current);
    return match ? batchLabel(match) : "another batch";
  };

  // People who can be added come first; people already in this batch sink to the bottom.
  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const inBatch = (id: string) => (savedIds.has(id) && !toRemove.has(id)) || toAdd.has(id);
    return users
      .filter((user) => !needle || `${user.full_name ?? ""} ${user.email ?? ""}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(inBatch(a.id)) - Number(inBatch(b.id)) || (a.full_name ?? "").localeCompare(b.full_name ?? ""));
  }, [users, query, savedIds, toAdd, toRemove]);

  if (!cohortId || !option) {
    return (
      <section className="cp-page">
        <CpPageHeader title="Participant list to the batch" description="Choose who from your company is part of a batch." />
        <CpNeedBatch loading={optionsLoading} />
      </section>
    );
  }

  const addable = [...ticked].filter((id) => !inDraftBatch(id));
  const leftRows = [
    ...members.map((member) => ({ id: member.id, name: member.fullName, email: member.email, isNew: false })),
    ...[...toAdd].map((id) => ({ id, name: userById.get(id)?.full_name ?? null, email: userById.get(id)?.email ?? null, isNew: true })),
  ].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  function moveTickedIntoDraft() {
    setToAdd((current) => {
      const next = new Set(current);
      addable.forEach((id) => (toRemove.has(id) ? null : next.add(id)));
      return next;
    });
    // Ticking someone who was marked for removal just keeps them.
    setToRemove((current) => {
      const next = new Set(current);
      addable.forEach((id) => next.delete(id));
      return next;
    });
    setTicked(new Set());
  }

  function toggleRemove(id: string, isNew: boolean) {
    if (isNew) {
      setToAdd((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      return;
    }
    setToRemove((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function commit() {
    setSaving(true);
    setError(null);
    const adding = [...toAdd];
    const removing = [...toRemove];
    const added = adding.length ? await addMembersToCohort(cohortId!, adding) : {};
    const removed = !added.error && removing.length ? await removeMembersFromCohort(cohortId!, removing) : {};
    // Everyone without a complete buddy pair (new people, or whose buddy was
    // just removed) is paired automatically; existing pairs are kept.
    const paired = !added.error && !removed.error ? await autoPairCommitmentBuddies(cohortId!) : {};
    setSaving(false);
    const failure = added.error || removed.error;
    if (failure) setError(`Some changes could not be saved: ${failure}`);
    else if (paired.error) setError(`Participant list saved, but buddies could not be paired: ${paired.error}`);
    else show(paired.paired ? "Participant list saved. Buddies paired." : "Participant list saved.");
    await load();
  }

  function save() {
    const moving = [...toAdd].filter((id) => {
      const current = userById.get(id)?.current_cohort_id;
      return current && current !== cohortId;
    });
    if (moving.length === 0) return void commit();
    confirm({
      title: "Move people to this batch?",
      body: (
        <>
          {moving.length} of the people you are adding {moving.length === 1 ? "is" : "are"} in another batch. Saving makes this
          their current batch, and their unfinished earlier plan is archived.
        </>
      ),
      confirmLabel: "Yes, save",
      onConfirm: commit,
    });
  }

  return (
    <section className="cp-page">
      <CpPageHeader title="Participant list to the batch" description={<>Choose who from your company is part of <strong>{batchLabel(option)}</strong>.</>} />
      {error && <CpError message={error} onRetry={() => void load()} />}
      {loading && users.length === 0 ? (
        <div className="cp-loading">Loading people…</div>
      ) : (
        <div className="cp-two">
          <div className="cp-panel">
            <div className="cp-panel-head">
              <h2>In this batch</h2>
              <span className="cp-pill cp-pill--ok">{leftRows.length - toRemove.size}</span>
            </div>
            {leftRows.length === 0 ? (
              <div className="cp-empty"><Users size={22} /><strong>No one yet</strong><span>Tick people on the right, then press “Add to this batch”.</span></div>
            ) : (
              <div className="cp-list cp-scroll">
                {leftRows.map((row) => {
                  const removing = toRemove.has(row.id);
                  return (
                    <div key={row.id} className={`cp-person${row.isNew ? " cp-person--new" : ""}${removing ? " cp-person--removing" : ""}`}>
                      <span className="cp-avatar">{initials(row.name)}</span>
                      <span className="cp-person-copy">
                        <strong>{row.name || "Unnamed user"}</strong>
                        <span>
                          {removing
                            ? "Will be removed when you save"
                            : row.isNew
                              ? otherBatchOf(row.id)
                                ? `Moving from ${otherBatchOf(row.id)} → this batch · not saved yet`
                                : "New — not saved yet"
                              : row.email}
                        </span>
                      </span>
                      <button type="button" className="cp-link-btn" disabled={saving} onClick={() => toggleRemove(row.id, row.isNew)}>
                        {removing ? "Keep" : row.isNew ? "Undo" : "Remove"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="cp-panel">
            <div className="cp-panel-head"><h2>All people in your company</h2><span className="cp-pill">{users.length}</span></div>
            <div className="cp-toolbar">
              <label className="cp-search">
                <Search size={15} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or email" aria-label="Search people by name or email" />
              </label>
            </div>
            <div className="cp-list cp-scroll">
              {visibleUsers.length === 0 && <div className="cp-empty"><span>No one matches your search.</span></div>}
              {visibleUsers.map((user) => {
                const inBatch = inDraftBatch(user.id);
                const checked = ticked.has(user.id);
                return (
                  <label key={user.id} className={`cp-person${inBatch ? " cp-person--in" : ""}${checked ? " cp-person--checked" : ""}`}>
                    <input
                      type="checkbox"
                      className="cp-check"
                      disabled={inBatch}
                      checked={checked}
                      onChange={() =>
                        setTicked((current) => {
                          const next = new Set(current);
                          if (next.has(user.id)) next.delete(user.id);
                          else next.add(user.id);
                          return next;
                        })
                      }
                    />
                    <span className="cp-avatar">{initials(user.full_name)}</span>
                    <span className="cp-person-copy">
                      <strong>{user.full_name || "Unnamed user"}</strong>
                      <span>{user.email || "No email"}</span>
                    </span>
                    <BatchPill
                      thisBatch={batchLabel(option)}
                      otherBatch={otherBatchOf(user.id)}
                      state={toAdd.has(user.id) ? "adding" : inBatch ? "in" : "out"}
                    />
                  </label>
                );
              })}
            </div>
            <div className="cp-add-bar">
              <span className="cp-hint">{addable.length ? <><strong>{addable.length}</strong> ticked</> : "Tick the people you want to add."}</span>
              <button type="button" className="cp-btn cp-btn--secondary" disabled={addable.length === 0 || saving} onClick={moveTickedIntoDraft}>
                <ArrowLeft size={15} /> Add {addable.length || ""} to this batch
              </button>
            </div>
          </div>
        </div>
      )}
      <CpSaveBar changes={changes} saving={saving} onSave={save} onDiscard={() => { setToAdd(new Set()); setToRemove(new Set()); setTicked(new Set()); }} />
      {dialog}
      {toast}
    </section>
  );
}
