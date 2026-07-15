"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Users, BookOpen, ChevronRight, X } from "lucide-react";
import {
  createCohort,
  listCohorts,
  getCohortDetail,
  getCompanyUsers,
  addMembersToCohort,
  removeMembersFromCohort,
} from "@/app/actions/cohorts";
import {
  listActiveLibraryItems,
  listCohortContent,
  assignContentToCohort,
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

export function CohortManagementView({ companyId }: CohortManagementViewProps) {
  const [cohorts, setCohorts] = useState<CohortSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");

  const refresh = useCallback(() => {
    if (!companyId) return;
    setLoading(true);
    listCohorts(companyId)
      .then(({ cohorts, error }) => {
        if (error) setError(error);
        else setCohorts(cohorts ?? []);
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    setError(null);
    const { error, id } = await createCohort({ name, description: description || undefined, startDate: startDate || undefined, companyId });
    if (error) {
      setError(error);
      return;
    }
    setName("");
    setDescription("");
    setStartDate("");
    setCreating(false);
    refresh();
    // Jump straight into the new cohort's Members tab so users can be added right away.
    if (id) setSelectedId(id);
  }

  if (!companyId) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
          Cohort Management
        </h2>
        <button
          onClick={() => setCreating((v) => !v)}
          className="btn btn--sm btn--primary"
        >
          <Plus size={14} strokeWidth={2.5} /> New Cohort
        </button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} className="card card--flat space-y-3">
          <input
            type="text"
            placeholder="Cohort name (e.g. Leadership Cohort - Jan 2026)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="form-input"
          />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="form-input"
            rows={2}
          />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="form-input"
          />
          <div className="flex gap-2">
            <button type="submit" className="btn btn--sm btn--accept">Create</button>
            <button type="button" onClick={() => setCreating(false)} className="btn btn--sm btn--decline">Cancel</button>
          </div>
        </form>
      )}

      {error && <p className="text-xs font-bold" style={{ color: "#ED4551" }}>{error}</p>}

      {loading ? (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      ) : cohorts.length === 0 ? (
        <div className="card card--flat text-center">
          <p className="card__subtitle mb-0">No cohorts yet. Create one above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cohorts.map((c) => (
            <div key={c.id}>
              <button
                onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
                className="card card--flat w-full flex items-center justify-between text-left"
              >
                <div>
                  <p className="font-bold" style={{ color: "var(--color-text-primary)" }}>{c.name}</p>
                  <p className="text-xs mt-1 flex items-center gap-3" style={{ color: "var(--color-text-muted)" }}>
                    <span className="flex items-center gap-1"><Users size={12} /> {c.memberCount} member{c.memberCount === 1 ? "" : "s"}</span>
                    <span className="flex items-center gap-1"><BookOpen size={12} /> {c.contentCount} items</span>
                  </p>
                </div>
                <ChevronRight size={18} style={{ transform: selectedId === c.id ? "rotate(90deg)" : undefined }} />
              </button>
              {selectedId === c.id && (
                <CohortDetailPanel companyId={companyId} cohortId={c.id} onChange={refresh} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CohortDetailPanel({
  companyId,
  cohortId,
  onChange,
}: {
  companyId: string;
  cohortId: string;
  onChange: () => void;
}) {
  const [tab, setTab] = useState<"members" | "content">("members");
  const [companyUsers, setCompanyUsers] = useState<{ id: string; full_name: string | null }[]>([]);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [libraryItems, setLibraryItems] = useState<PrepareContentItem[]>([]);
  const [assignedContentIds, setAssignedContentIds] = useState<Set<string>>(new Set());
  const [pendingAddIds, setPendingAddIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detailRes, usersRes, contentRes, libraryRes] = await Promise.all([
        getCohortDetail(cohortId),
        getCompanyUsers(companyId),
        listCohortContent(cohortId),
        listActiveLibraryItems(),
      ]);
      // Surface the first real error instead of silently rendering an empty list —
      // an "Access denied"/auth failure otherwise looks identical to "no users yet".
      const firstError = detailRes.error || usersRes.error || contentRes.error || libraryRes.error;
      setError(firstError ?? null);
      setMemberIds(new Set((detailRes.members ?? []).map((m) => m.id)));
      setCompanyUsers(usersRes.users ?? []);
      setAssignedContentIds(new Set((contentRes.items ?? []).map((i) => i.id)));
      setLibraryItems(libraryRes.items ?? []);
    } catch (e) {
      // A rejected server-action call (e.g. a transient dev-mode reload) must not
      // leave the panel stuck on "Loading…" forever with no way to recover.
      setError(e instanceof Error ? e.message : "Failed to load cohort details");
    } finally {
      setLoading(false);
    }
  }, [cohortId, companyId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const [pendingContentIds, setPendingContentIds] = useState<Set<string>>(new Set());

  const currentMembers = useMemo(
    () => companyUsers.filter((u) => memberIds.has(u.id)),
    [companyUsers, memberIds]
  );
  const availableUsers = useMemo(
    () => companyUsers.filter((u) => !memberIds.has(u.id)),
    [companyUsers, memberIds]
  );
  const assignedItems = useMemo(
    () => libraryItems.filter((i) => assignedContentIds.has(i.id)),
    [libraryItems, assignedContentIds]
  );
  const availableItems = useMemo(
    () => libraryItems.filter((i) => !assignedContentIds.has(i.id)),
    [libraryItems, assignedContentIds]
  );

  function togglePendingAdd(userId: string) {
    setPendingAddIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleAddSelected() {
    if (pendingAddIds.size === 0) return;
    setBusy(true);
    setError(null);
    const { error } = await addMembersToCohort(cohortId, Array.from(pendingAddIds));
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    setPendingAddIds(new Set());
    await refresh();
    onChange();
  }

  async function handleRemoveMember(userId: string) {
    setBusy(true);
    setError(null);
    const { error } = await removeMembersFromCohort(cohortId, [userId]);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    await refresh();
    onChange();
  }

  function togglePendingContent(itemId: string) {
    setPendingContentIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function handleAddContentSelected() {
    if (pendingContentIds.size === 0) return;
    setBusy(true);
    setError(null);
    const { error } = await assignContentToCohort(cohortId, Array.from(pendingContentIds));
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    setPendingContentIds(new Set());
    await refresh();
    onChange();
  }

  async function handleRemoveContent(itemId: string) {
    setBusy(true);
    setError(null);
    const { error } = await removeContentFromCohort(cohortId, itemId);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    await refresh();
    onChange();
  }

  return (
    <div className="card card--flat mt-2 space-y-4">
      <div className="flex gap-2">
        {(["members", "content"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`btn btn--sm ${tab === t ? "btn--primary" : "btn--decline"}`}
          >
            {t === "members" ? "Members" : "Content"}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-3">
          <p className="text-xs font-bold" style={{ color: "#ED4551" }}>{error}</p>
          <button onClick={() => refresh()} className="btn btn--sm btn--decline">Retry</button>
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      ) : (
        <>
          {tab === "members" && (
            <div className="space-y-6">
              {companyUsers.length === 0 && !error && (
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  No users in this company yet. Create some in User Management first.
                </p>
              )}

              {currentMembers.length > 0 && (
                <div>
                  <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>
                    Current members ({currentMembers.length})
                  </p>
                  <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                    {currentMembers.map((u) => (
                      <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="text-sm font-semibold">{u.full_name ?? "Unnamed user"}</span>
                        <button
                          onClick={() => handleRemoveMember(u.id)}
                          disabled={busy}
                          className="btn btn--icon"
                          aria-label={`Remove ${u.full_name ?? "member"}`}
                          title="Remove from cohort"
                        >
                          <X size={14} strokeWidth={2.5} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {availableUsers.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-black uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                      Add members
                    </p>
                    {pendingAddIds.size > 0 && (
                      <button onClick={handleAddSelected} disabled={busy} className="btn btn--sm btn--accept">
                        Add {pendingAddIds.size} selected
                      </button>
                    )}
                  </div>
                  <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                    {availableUsers.map((u) => (
                      <li key={u.id} className="flex items-center gap-3 py-2">
                        <input
                          type="checkbox"
                          checked={pendingAddIds.has(u.id)}
                          disabled={busy}
                          onChange={() => togglePendingAdd(u.id)}
                          aria-label={u.full_name ?? u.id}
                        />
                        <span className="text-sm font-semibold">{u.full_name ?? "Unnamed user"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === "content" && (
            <div className="space-y-6">
              {libraryItems.length === 0 && !error && (
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  No content in the library yet — ask superadmin to add some in Content Library.
                </p>
              )}

              {assignedItems.length > 0 && (
                <div>
                  <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>
                    Assigned content ({assignedItems.length})
                  </p>
                  <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                    {assignedItems.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>{item.type}</span>
                          <span className="text-sm font-semibold">{item.title}</span>
                        </span>
                        <button
                          onClick={() => handleRemoveContent(item.id)}
                          disabled={busy}
                          className="btn btn--icon"
                          aria-label={`Remove ${item.title}`}
                          title="Remove from cohort"
                        >
                          <X size={14} strokeWidth={2.5} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {availableItems.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-black uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                      Add content
                    </p>
                    {pendingContentIds.size > 0 && (
                      <button onClick={handleAddContentSelected} disabled={busy} className="btn btn--sm btn--accept">
                        Add {pendingContentIds.size} selected
                      </button>
                    )}
                  </div>
                  <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                    {availableItems.map((item) => (
                      <li key={item.id} className="flex items-center gap-3 py-2">
                        <input
                          type="checkbox"
                          checked={pendingContentIds.has(item.id)}
                          disabled={busy}
                          onChange={() => togglePendingContent(item.id)}
                          aria-label={item.title}
                        />
                        <span className="text-xs font-black uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>{item.type}</span>
                        <span className="text-sm font-semibold">{item.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
