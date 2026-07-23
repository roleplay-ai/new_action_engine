"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  addMembersToCohort,
  createCohort,
  getCohortDetail,
  getCompanyUsers,
  listCohorts,
  removeMembersFromCohort,
} from "@/app/actions/cohorts";
import {
  assignContentToCohort,
  listActiveLibraryItems,
  listCohortContent,
  removeContentFromCohort,
} from "@/app/actions/prepare-content";
import type { PrepareContentItem } from "@/lib/types";

interface CohortManagementViewProps {
  companyId: string | null;
  role: string;
}

type CohortSummary = {
  id: string;
  name: string;
  description?: string | null;
  startDate?: string | null;
  memberCount: number;
  contentCount: number;
};

type CompanyUser = { id: string; full_name: string | null };

function formatStartDate(date: string | null | undefined) {
  if (!date) return "Start date not set";
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function initials(value: string | null | undefined) {
  const words = (value || "Unnamed user").trim().split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase()).join("") || "U";
}

function CohortListSkeleton() {
  return (
    <div className="cohort-admin-list" aria-label="Loading cohorts" aria-busy="true">
      {[0, 1, 2].map((item) => (
        <div key={item} className="cohort-admin-row cohort-admin-row--skeleton">
          <span className="cohort-admin-skeleton cohort-admin-skeleton--avatar" />
          <span className="cohort-admin-skeleton-copy">
            <span className="cohort-admin-skeleton cohort-admin-skeleton--title" />
            <span className="cohort-admin-skeleton cohort-admin-skeleton--text" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function CohortManagementView({ companyId }: CohortManagementViewProps) {
  const [cohorts, setCohorts] = useState<CohortSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");

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
      const nextCohorts = result.cohorts ?? [];
      setCohorts(nextCohorts);
      setSelectedId((current) => {
        if (current && nextCohorts.some((cohort) => cohort.id === current)) return current;
        return nextCohorts[0]?.id ?? null;
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load cohorts");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setCohorts([]);
    setSelectedId(null);
    setCreating(false);
    setQuery("");
    void refresh();
  }, [companyId, refresh]);

  const filteredCohorts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return cohorts;
    return cohorts.filter((cohort) =>
      `${cohort.name} ${cohort.description ?? ""}`.toLowerCase().includes(needle)
    );
  }, [cohorts, query]);

  const selectedCohort = useMemo(
    () => cohorts.find((cohort) => cohort.id === selectedId) ?? null,
    [cohorts, selectedId]
  );

  const totals = useMemo(
    () => ({
      members: cohorts.reduce((sum, cohort) => sum + cohort.memberCount, 0),
      content: cohorts.reduce((sum, cohort) => sum + cohort.contentCount, 0),
    }),
    [cohorts]
  );

  function closeCreateDialog() {
    if (creatingBusy) return;
    setCreating(false);
    setName("");
    setDescription("");
    setStartDate("");
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!companyId || !name.trim() || creatingBusy) return;
    setCreatingBusy(true);
    setError(null);
    try {
      const result = await createCohort({
        name,
        description: description || undefined,
        startDate: startDate || undefined,
        companyId,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setName("");
      setDescription("");
      setStartDate("");
      setCreating(false);
      await refresh();
      if (result.id) setSelectedId(result.id);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to create cohort");
    } finally {
      setCreatingBusy(false);
    }
  }

  if (!companyId) return null;

  return (
    <section className="cohort-admin-page">
      <header className="cohort-admin-header">
        <div>
          <p className="cohort-admin-eyebrow">People &amp; learning operations</p>
          <h1>Cohort management</h1>
          <p>Organise participants, assign preparation content, and keep every learning group ready.</p>
        </div>
        <div className="cohort-admin-header-actions">
          <button
            type="button"
            onClick={() => void refresh()}
            className="cohort-admin-button cohort-admin-button--secondary"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "cohort-admin-spin" : undefined} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="cohort-admin-button cohort-admin-button--primary"
          >
            <Plus size={17} /> New cohort
          </button>
        </div>
      </header>

      <div className="cohort-admin-stats" aria-label="Cohort overview">
        <div className="cohort-admin-stat">
          <span className="cohort-admin-stat-icon"><Users size={18} /></span>
          <div><strong>{cohorts.length}</strong><span>Active cohorts</span></div>
        </div>
        <div className="cohort-admin-stat">
          <span className="cohort-admin-stat-icon"><UserPlus size={18} /></span>
          <div><strong>{totals.members}</strong><span>Cohort seats</span></div>
        </div>
        <div className="cohort-admin-stat">
          <span className="cohort-admin-stat-icon"><BookOpen size={18} /></span>
          <div><strong>{totals.content}</strong><span>Content assignments</span></div>
        </div>
      </div>

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
            <div><h2>Cohorts</h2><span>{cohorts.length} active</span></div>
            <label className="cohort-admin-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search cohorts"
                aria-label="Search cohorts"
              />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
            </label>
          </div>

          {loading && cohorts.length === 0 ? (
            <CohortListSkeleton />
          ) : cohorts.length === 0 ? (
            <div className="cohort-admin-empty">
              <span><Users size={23} /></span>
              <h3>Create your first cohort</h3>
              <p>Set up a learning group, then add participants and content.</p>
              <button type="button" onClick={() => setCreating(true)}>Create cohort <ArrowRight size={15} /></button>
            </div>
          ) : filteredCohorts.length === 0 ? (
            <div className="cohort-admin-empty cohort-admin-empty--compact">
              <h3>No matching cohorts</h3>
              <p>Try a different name or description.</p>
              <button type="button" onClick={() => setQuery("")}>Clear search</button>
            </div>
          ) : (
            <div className="cohort-admin-list">
              {filteredCohorts.map((cohort) => {
                const selected = selectedId === cohort.id;
                return (
                  <button
                    type="button"
                    key={cohort.id}
                    className={`cohort-admin-row${selected ? " cohort-admin-row--selected" : ""}`}
                    onClick={() => setSelectedId(cohort.id)}
                    aria-current={selected ? "true" : undefined}
                  >
                    <span className="cohort-admin-cohort-mark">{initials(cohort.name)}</span>
                    <span className="cohort-admin-row-copy">
                      <strong>{cohort.name}</strong>
                      <span>{cohort.description || formatStartDate(cohort.startDate)}</span>
                      <span className="cohort-admin-row-meta">
                        <span><Users size={12} /> {cohort.memberCount}</span>
                        <span><BookOpen size={12} /> {cohort.contentCount}</span>
                      </span>
                    </span>
                    <ChevronRight size={17} className="cohort-admin-row-chevron" />
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <main className="cohort-admin-workspace">
          {selectedCohort ? (
            <CohortDetailPanel
              key={`${companyId}:${selectedCohort.id}`}
              companyId={companyId}
              cohort={selectedCohort}
              onChange={refresh}
            />
          ) : (
            <div className="cohort-admin-placeholder">
              <span><Users size={25} /></span>
              <h2>Select a cohort</h2>
              <p>Choose a cohort to manage its participants and learning content.</p>
            </div>
          )}
        </main>
      </div>

      {creating && (
        <div className="cohort-admin-modal-backdrop" role="presentation" onMouseDown={closeCreateDialog}>
          <div className="cohort-admin-modal" role="dialog" aria-modal="true" aria-labelledby="new-cohort-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="cohort-admin-modal-head">
              <div><p className="cohort-admin-eyebrow">New learning group</p><h2 id="new-cohort-title">Create a cohort</h2></div>
              <button type="button" onClick={closeCreateDialog} disabled={creatingBusy} aria-label="Close"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <label className="cohort-admin-field">
                <span>Cohort name <em>Required</em></span>
                <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Leadership cohort — January 2026" required />
              </label>
              <label className="cohort-admin-field">
                <span>Description <em>Optional</em></span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is this cohort working towards?" rows={3} />
              </label>
              <label className="cohort-admin-field">
                <span>Start date <em>Optional</em></span>
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <div className="cohort-admin-modal-note"><Info size={16} /><span>You can add participants and learning content immediately after creation.</span></div>
              <div className="cohort-admin-modal-actions">
                <button type="button" onClick={closeCreateDialog} disabled={creatingBusy} className="cohort-admin-button cohort-admin-button--secondary">Cancel</button>
                <button type="submit" disabled={creatingBusy || !name.trim()} className="cohort-admin-button cohort-admin-button--primary">
                  {creatingBusy ? <Loader2 size={16} className="cohort-admin-spin" /> : <Plus size={16} />}
                  {creatingBusy ? "Creating…" : "Create cohort"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function CohortDetailPanel({
  companyId,
  cohort,
  onChange,
}: {
  companyId: string;
  cohort: CohortSummary;
  onChange: () => Promise<void> | void;
}) {
  const [tab, setTab] = useState<"members" | "content">("members");
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [libraryItems, setLibraryItems] = useState<PrepareContentItem[]>([]);
  const [assignedContentIds, setAssignedContentIds] = useState<Set<string>>(new Set());
  const [pendingAddIds, setPendingAddIds] = useState<Set<string>>(new Set());
  const [pendingContentIds, setPendingContentIds] = useState<Set<string>>(new Set());
  const [memberQuery, setMemberQuery] = useState("");
  const [contentQuery, setContentQuery] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detailResult, usersResult, contentResult, libraryResult] = await Promise.all([
        getCohortDetail(cohort.id),
        getCompanyUsers(companyId),
        listCohortContent(cohort.id),
        listActiveLibraryItems(),
      ]);
      const firstError = detailResult.error || usersResult.error || contentResult.error || libraryResult.error;
      if (firstError) setError(firstError);
      setMemberIds(new Set((detailResult.members ?? []).map((member) => member.id)));
      setCompanyUsers(usersResult.users ?? []);
      setAssignedContentIds(new Set((contentResult.items ?? []).map((item) => item.id)));
      setLibraryItems(libraryResult.items ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load cohort details");
    } finally {
      setLoading(false);
    }
  }, [cohort.id, companyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const currentMembers = useMemo(
    () => companyUsers.filter((user) => memberIds.has(user.id)),
    [companyUsers, memberIds]
  );
  const availableUsers = useMemo(
    () => companyUsers.filter((user) => !memberIds.has(user.id)),
    [companyUsers, memberIds]
  );
  const visibleAvailableUsers = useMemo(() => {
    const needle = memberQuery.trim().toLowerCase();
    if (!needle) return availableUsers;
    return availableUsers.filter((user) => (user.full_name || "Unnamed user").toLowerCase().includes(needle));
  }, [availableUsers, memberQuery]);
  const assignedItems = useMemo(
    () => libraryItems.filter((item) => assignedContentIds.has(item.id)),
    [libraryItems, assignedContentIds]
  );
  const availableItems = useMemo(
    () => libraryItems.filter((item) => !assignedContentIds.has(item.id)),
    [libraryItems, assignedContentIds]
  );
  const visibleAvailableItems = useMemo(() => {
    const needle = contentQuery.trim().toLowerCase();
    if (!needle) return availableItems;
    return availableItems.filter((item) => `${item.title} ${item.type}`.toLowerCase().includes(needle));
  }, [availableItems, contentQuery]);

  function toggleSelection(id: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) {
    setter((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible(ids: string[], selected: Set<string>, setter: React.Dispatch<React.SetStateAction<Set<string>>>) {
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    setter((previous) => {
      const next = new Set(previous);
      ids.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  }

  async function runMutation(action: string, mutation: () => Promise<{ error?: string }>, after?: () => void) {
    if (busyAction) return;
    setBusyAction(action);
    setError(null);
    try {
      const result = await mutation();
      if (result.error) {
        setError(result.error);
        return;
      }
      after?.();
      await refresh();
      await onChange();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "The update could not be completed");
    } finally {
      setBusyAction(null);
    }
  }

  const allVisibleMembersSelected = visibleAvailableUsers.length > 0 && visibleAvailableUsers.every((user) => pendingAddIds.has(user.id));
  const allVisibleContentSelected = visibleAvailableItems.length > 0 && visibleAvailableItems.every((item) => pendingContentIds.has(item.id));

  return (
    <div className="cohort-admin-detail">
      <div className="cohort-admin-detail-head">
        <div className="cohort-admin-detail-title">
          <span className="cohort-admin-cohort-mark cohort-admin-cohort-mark--large">{initials(cohort.name)}</span>
          <div>
            <p className="cohort-admin-eyebrow">Active cohort</p>
            <h2>{cohort.name}</h2>
            <p>{cohort.description || "No description added."}</p>
          </div>
        </div>
        <span className="cohort-admin-date"><CalendarDays size={15} /> {formatStartDate(cohort.startDate)}</span>
      </div>

      <div className="cohort-admin-tabs" role="tablist" aria-label="Cohort details">
        <button type="button" role="tab" aria-selected={tab === "members"} onClick={() => setTab("members")} className={tab === "members" ? "is-active" : ""}>
          <Users size={16} /> Members <span>{currentMembers.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === "content"} onClick={() => setTab("content")} className={tab === "content" ? "is-active" : ""}>
          <BookOpen size={16} /> Learning content <span>{assignedItems.length}</span>
        </button>
      </div>

      {error && (
        <div className="cohort-admin-alert cohort-admin-alert--error cohort-admin-alert--inner" role="alert">
          <AlertCircle size={17} /><div><strong>Unable to update this cohort</strong><span>{error}</span></div>
          <button type="button" onClick={() => void refresh()}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="cohort-admin-detail-loading" aria-busy="true">
          <Loader2 size={20} className="cohort-admin-spin" /><span>Loading cohort details…</span>
        </div>
      ) : tab === "members" ? (
        <div className="cohort-admin-picker-grid">
          <section className="cohort-admin-panel">
            <div className="cohort-admin-panel-head"><div><h3>Current members</h3><p>People currently learning in this cohort.</p></div><span>{currentMembers.length}</span></div>
            {currentMembers.length === 0 ? (
              <div className="cohort-admin-mini-empty"><Users size={20} /><strong>No members yet</strong><span>Select people from the company directory.</span></div>
            ) : (
              <div className="cohort-admin-people-list">
                {currentMembers.map((user) => (
                  <div key={user.id} className="cohort-admin-person">
                    <span className="cohort-admin-avatar">{initials(user.full_name)}</span>
                    <div><strong>{user.full_name || "Unnamed user"}</strong><span>Cohort participant</span></div>
                    <button
                      type="button"
                      onClick={() => void runMutation(`remove-member:${user.id}`, () => removeMembersFromCohort(cohort.id, [user.id]))}
                      disabled={Boolean(busyAction)}
                      aria-label={`Remove ${user.full_name || "member"}`}
                      title="Remove from cohort"
                    >
                      {busyAction === `remove-member:${user.id}` ? <Loader2 size={15} className="cohort-admin-spin" /> : <X size={15} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="cohort-admin-panel">
            <div className="cohort-admin-panel-head"><div><h3>Add participants</h3><p>{availableUsers.length} available in this company.</p></div></div>
            <div className="cohort-admin-notice"><Info size={17} /><p><strong>Moving between cohorts</strong><span>Adding an existing participant makes this their current cohort. Any unfinished earlier plan is archived and remains available in Archived actions.</span></p></div>
            {companyUsers.length === 0 ? (
              <div className="cohort-admin-mini-empty"><Users size={20} /><strong>No company users</strong><span>Create participants in User management first.</span></div>
            ) : availableUsers.length === 0 ? (
              <div className="cohort-admin-mini-empty"><Check size={20} /><strong>Everyone is assigned</strong><span>All company participants are in this cohort.</span></div>
            ) : (
              <>
                <label className="cohort-admin-search cohort-admin-search--panel"><Search size={15} /><input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Search participants" aria-label="Search participants" /></label>
                <button type="button" className="cohort-admin-select-all" onClick={() => toggleAllVisible(visibleAvailableUsers.map((user) => user.id), pendingAddIds, setPendingAddIds)} disabled={Boolean(busyAction) || visibleAvailableUsers.length === 0}>
                  <span className={`cohort-admin-checkbox${allVisibleMembersSelected ? " is-checked" : ""}`}>{allVisibleMembersSelected && <Check size={12} />}</span>{allVisibleMembersSelected ? "Clear visible" : "Select all visible"}
                </button>
                <div className="cohort-admin-selection-list">
                  {visibleAvailableUsers.map((user) => (
                    <label key={user.id} className="cohort-admin-select-row">
                      <input type="checkbox" checked={pendingAddIds.has(user.id)} onChange={() => toggleSelection(user.id, setPendingAddIds)} disabled={Boolean(busyAction)} />
                      <span className="cohort-admin-checkbox">{pendingAddIds.has(user.id) && <Check size={12} />}</span>
                      <span className="cohort-admin-avatar">{initials(user.full_name)}</span>
                      <strong>{user.full_name || "Unnamed user"}</strong>
                    </label>
                  ))}
                  {visibleAvailableUsers.length === 0 && <div className="cohort-admin-no-results">No participants match your search.</div>}
                </div>
                <div className="cohort-admin-panel-action">
                  <span>{pendingAddIds.size ? `${pendingAddIds.size} selected` : "Select participants to add"}</span>
                  <button type="button" onClick={() => void runMutation("add-members", () => addMembersToCohort(cohort.id, Array.from(pendingAddIds)), () => setPendingAddIds(new Set()))} disabled={Boolean(busyAction) || pendingAddIds.size === 0} className="cohort-admin-button cohort-admin-button--primary">
                    {busyAction === "add-members" ? <Loader2 size={15} className="cohort-admin-spin" /> : <UserPlus size={15} />} Add to cohort
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : (
        <div className="cohort-admin-picker-grid">
          <section className="cohort-admin-panel">
            <div className="cohort-admin-panel-head"><div><h3>Assigned content</h3><p>Preparation visible to this cohort.</p></div><span>{assignedItems.length}</span></div>
            {assignedItems.length === 0 ? (
              <div className="cohort-admin-mini-empty"><BookOpen size={20} /><strong>No content assigned</strong><span>Select items from the active content library.</span></div>
            ) : (
              <div className="cohort-admin-content-list">
                {assignedItems.map((item) => (
                  <div key={item.id} className="cohort-admin-content-row">
                    <span className="cohort-admin-type-badge">{item.type}</span>
                    <div><strong>{item.title}</strong><span>{item.description || "No description"}</span></div>
                    <button type="button" onClick={() => void runMutation(`remove-content:${item.id}`, () => removeContentFromCohort(cohort.id, item.id))} disabled={Boolean(busyAction)} aria-label={`Remove ${item.title}`} title="Remove from cohort">
                      {busyAction === `remove-content:${item.id}` ? <Loader2 size={15} className="cohort-admin-spin" /> : <X size={15} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="cohort-admin-panel">
            <div className="cohort-admin-panel-head"><div><h3>Add learning content</h3><p>{availableItems.length} active items available.</p></div></div>
            {libraryItems.length === 0 ? (
              <div className="cohort-admin-mini-empty"><BookOpen size={20} /><strong>The library is empty</strong><span>Add active content in Content management first.</span></div>
            ) : availableItems.length === 0 ? (
              <div className="cohort-admin-mini-empty"><Check size={20} /><strong>Everything is assigned</strong><span>This cohort has all active library items.</span></div>
            ) : (
              <>
                <label className="cohort-admin-search cohort-admin-search--panel"><Search size={15} /><input value={contentQuery} onChange={(event) => setContentQuery(event.target.value)} placeholder="Search content" aria-label="Search content" /></label>
                <button type="button" className="cohort-admin-select-all" onClick={() => toggleAllVisible(visibleAvailableItems.map((item) => item.id), pendingContentIds, setPendingContentIds)} disabled={Boolean(busyAction) || visibleAvailableItems.length === 0}>
                  <span className={`cohort-admin-checkbox${allVisibleContentSelected ? " is-checked" : ""}`}>{allVisibleContentSelected && <Check size={12} />}</span>{allVisibleContentSelected ? "Clear visible" : "Select all visible"}
                </button>
                <div className="cohort-admin-selection-list">
                  {visibleAvailableItems.map((item) => (
                    <label key={item.id} className="cohort-admin-select-row cohort-admin-select-row--content">
                      <input type="checkbox" checked={pendingContentIds.has(item.id)} onChange={() => toggleSelection(item.id, setPendingContentIds)} disabled={Boolean(busyAction)} />
                      <span className="cohort-admin-checkbox">{pendingContentIds.has(item.id) && <Check size={12} />}</span>
                      <span className="cohort-admin-type-badge">{item.type}</span>
                      <span><strong>{item.title}</strong><small>{item.description || "No description"}</small></span>
                    </label>
                  ))}
                  {visibleAvailableItems.length === 0 && <div className="cohort-admin-no-results">No content matches your search.</div>}
                </div>
                <div className="cohort-admin-panel-action">
                  <span>{pendingContentIds.size ? `${pendingContentIds.size} selected` : "Select content to assign"}</span>
                  <button type="button" onClick={() => void runMutation("add-content", () => assignContentToCohort(cohort.id, Array.from(pendingContentIds)), () => setPendingContentIds(new Set()))} disabled={Boolean(busyAction) || pendingContentIds.size === 0} className="cohort-admin-button cohort-admin-button--primary">
                    {busyAction === "add-content" ? <Loader2 size={15} className="cohort-admin-spin" /> : <Plus size={15} />} Assign content
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
