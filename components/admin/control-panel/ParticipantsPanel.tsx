"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, Users } from "lucide-react";
import { addMembersToCohort, getCohortDetail, getCompanyUsers, removeMembersFromCohort } from "@/app/actions/cohorts";
import type { CohortMember } from "@/lib/types";
import { batchLabel, CpError, CpNeedBatch, CpPageHeader, initials, useConfirm, useControlPanelBatch, useReportViewReady, useToast } from "./shared";

type CompanyUser = { id: string; full_name: string | null; email: string | null; current_cohort_id: string | null };

export function ParticipantsPanel() {
  const { companyId, cohortId, option, options, loading: optionsLoading } = useControlPanelBatch();
  const [members, setMembers] = useState<CohortMember[]>([]);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
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
    setLoading(false);
  }, [cohortId, companyId]);

  useEffect(() => {
    setTicked(new Set());
    setQuery("");
    void load();
  }, [load]);

  useReportViewReady(!optionsLoading && !loading);

  const memberIds = useMemo(() => new Set(members.map((member) => member.id)), [members]);
  const labelFor = useCallback(
    (id: string | null) => {
      const match = options.find((item) => item.cohortId === id);
      return match ? batchLabel(match) : null;
    },
    [options]
  );
  // People who can be added come first; people already in this batch sink to the bottom.
  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users
      .filter((user) => !needle || `${user.full_name ?? ""} ${user.email ?? ""}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(memberIds.has(a.id)) - Number(memberIds.has(b.id)) || (a.full_name ?? "").localeCompare(b.full_name ?? ""));
  }, [users, query, memberIds]);
  const addable = [...ticked].filter((id) => !memberIds.has(id));

  if (!cohortId || !option) {
    return (
      <section className="cp-page">
        <CpPageHeader title="Participant list to the batch" description="Choose who from your company is part of a batch." />
        <CpNeedBatch loading={optionsLoading} />
      </section>
    );
  }

  async function addTicked() {
    const ids = addable;
    setBusy("add");
    setError(null);
    const result = await addMembersToCohort(cohortId!, ids);
    setBusy(null);
    if (result.error) return setError(result.error);
    setTicked(new Set());
    show(`${ids.length} ${ids.length === 1 ? "person" : "people"} added to the batch.`);
    await load();
  }

  function requestAdd() {
    const moving = addable.filter((id) => {
      const user = users.find((item) => item.id === id);
      return user?.current_cohort_id && user.current_cohort_id !== cohortId;
    });
    if (moving.length === 0) return void addTicked();
    confirm({
      title: "Move people to this batch?",
      body: (
        <>
          {moving.length} of the people you ticked {moving.length === 1 ? "is" : "are"} in another batch. Adding them here makes this
          their current batch, and their unfinished earlier plan is archived.
        </>
      ),
      confirmLabel: "Yes, add them",
      onConfirm: addTicked,
    });
  }

  function requestRemove(member: CohortMember) {
    const name = member.fullName || "this person";
    confirm({
      title: `Remove ${name}?`,
      body: <>They will no longer be in <strong>{batchLabel(option!)}</strong>. You can add them again later.</>,
      confirmLabel: "Yes, remove",
      danger: true,
      onConfirm: async () => {
        setBusy(`remove:${member.id}`);
        const result = await removeMembersFromCohort(cohortId!, [member.id]);
        setBusy(null);
        if (result.error) return setError(result.error);
        show(`${name} removed from the batch.`);
        await load();
      },
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
            <div className="cp-panel-head"><h2>In this batch</h2><span className="cp-pill cp-pill--ok">{members.length}</span></div>
            {members.length === 0 ? (
              <div className="cp-empty"><Users size={22} /><strong>No one yet</strong><span>Tick people on the right, then press “Add to batch”.</span></div>
            ) : (
              <div className="cp-list cp-scroll">
                {[...members].sort((a, b) => (a.fullName ?? "").localeCompare(b.fullName ?? "")).map((member) => (
                  <div key={member.id} className="cp-person">
                    <span className="cp-avatar">{initials(member.fullName)}</span>
                    <span className="cp-person-copy"><strong>{member.fullName || "Unnamed user"}</strong><span>{member.email}</span></span>
                    <button type="button" className="cp-link-btn" disabled={Boolean(busy)} onClick={() => requestRemove(member)}>
                      {busy === `remove:${member.id}` ? <Loader2 size={13} className="cp-spin" /> : "Remove"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="cp-panel">
            <div className="cp-panel-head"><h2>All people in your company</h2><span className="cp-pill">{users.length}</span></div>
            <div className="cp-toolbar">
              <label className="cp-search">
                <Search size={15} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name" aria-label="Search people" />
              </label>
              <button
                type="button"
                className="cp-btn cp-btn--secondary cp-btn--small"
                onClick={() => setTicked(new Set(visibleUsers.filter((user) => !memberIds.has(user.id)).map((user) => user.id)))}
              >
                Tick everyone not in this batch
              </button>
            </div>
            <div className="cp-list cp-scroll">
              {visibleUsers.length === 0 && <div className="cp-empty"><span>No one matches your search.</span></div>}
              {visibleUsers.map((user) => {
                const inBatch = memberIds.has(user.id);
                const elsewhere = !inBatch && user.current_cohort_id ? labelFor(user.current_cohort_id) : null;
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
                      <span>{elsewhere ? `Now in ${elsewhere}` : user.email}</span>
                    </span>
                    {inBatch ? (
                      <span className="cp-pill cp-pill--ok">In this batch</span>
                    ) : elsewhere ? (
                      <span className="cp-pill cp-pill--warn">In another batch</span>
                    ) : (
                      <span className="cp-pill">Not in a batch</span>
                    )}
                  </label>
                );
              })}
            </div>
            <div className="cp-add-bar">
              <span className="cp-hint">{addable.length ? <><strong>{addable.length}</strong> ticked</> : "Tick the people you want to add."}</span>
              <button type="button" className="cp-btn" disabled={addable.length === 0 || Boolean(busy)} onClick={requestAdd}>
                {busy === "add" ? <Loader2 size={15} className="cp-spin" /> : <Plus size={15} />} Add {addable.length || ""} to batch
              </button>
            </div>
          </div>
        </div>
      )}
      {dialog}
      {toast}
    </section>
  );
}
