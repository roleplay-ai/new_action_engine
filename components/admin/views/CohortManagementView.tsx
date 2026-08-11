"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  Info,
  ImagePlus,
  Loader2,
  Megaphone,
  MessageSquareText,
  NotebookPen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  addCohortDate,
  addMembersToCohort,
  createCohort,
  deleteCohort,
  getCohortDetail,
  getCompanyUsers,
  listCohortDates,
  listCohorts,
  removeCohortDate,
  removeMembersFromCohort,
  updateCohort,
} from "@/app/actions/cohorts";
import { nextUpcomingCohortDate } from "@/lib/cohort-dates";
import { uploadCohortLogo } from "@/lib/cohort-logo-upload";
import {
  assignContentToCohort,
  listActiveLibraryItems,
  listCohortContent,
  removeContentFromCohort,
} from "@/app/actions/prepare-content";
import { listTrainers } from "@/app/actions/trainers";
import { getCohortNotices, postCohortNotice, deleteCohortNotice } from "@/app/actions/cohort-notices";
import { createFacilitator, deleteFacilitator, listFacilitators } from "@/app/actions/facilitators";
import { assignMemberTag, createParticipantTag, listParticipantTags } from "@/app/actions/participant-tags";
import { FacilitatorPdfUploadField } from "@/components/admin/content/FacilitatorPdfUploadField";
import type { CohortDate, CohortMember, CohortNotice, CompanyBrand, Facilitator, ParticipantTag, PrepareContentItem, Trainer } from "@/lib/types";

interface CohortManagementViewProps {
  companyId: string | null;
  role: string;
}

type CohortSummary = {
  id: string;
  name: string;
  batchName: string;
  moduleName?: string | null;
  description?: string | null;
  trainingContent?: string | null;
  businessContext?: string | null;
  dates: string[];
  memberCount: number;
  contentCount: number;
  logoUrl?: string | null;
  trainerId?: string | null;
  trainer?: Trainer | null;
};

type CompanyUser = { id: string; full_name: string | null; email: string | null };

function formatStartDate(date: string | null | undefined) {
  if (!date) return "No dates set";
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

export function CohortManagementView({ companyId, role }: CohortManagementViewProps) {
  const [cohorts, setCohorts] = useState<CohortSummary[]>([]);
  const [company, setCompany] = useState<CompanyBrand | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [batchName, setBatchName] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [description, setDescription] = useState("");
  const [trainingContent, setTrainingContent] = useState("");
  const [businessContext, setBusinessContext] = useState("");
  const [initialDates, setInitialDates] = useState<string[]>([]);
  const [pendingDateValue, setPendingDateValue] = useState("");

  const duplicateCohort = useMemo(() => {
    const bn = batchName.trim().toLowerCase();
    if (!bn) return false;
    const mn = moduleName.trim().toLowerCase();
    return cohorts.some(
      (existing) => existing.batchName.trim().toLowerCase() === bn && (existing.moduleName ?? "").trim().toLowerCase() === mn
    );
  }, [cohorts, batchName, moduleName]);

  function addPendingDate() {
    if (!pendingDateValue || initialDates.includes(pendingDateValue)) return;
    setInitialDates((current) => [...current, pendingDateValue].sort());
    setPendingDateValue("");
  }

  function removePendingDate(date: string) {
    setInitialDates((current) => current.filter((existing) => existing !== date));
  }

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
      setCompany(result.company ?? null);
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
    setCompany(null);
    setSelectedId(null);
    setCreating(false);
    setQuery("");
    void refresh();
  }, [companyId, refresh]);

  const filteredCohorts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return cohorts;
    return cohorts.filter((cohort) =>
      `${cohort.batchName} ${cohort.moduleName ?? ""} ${cohort.description ?? ""}`.toLowerCase().includes(needle)
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
    setBatchName("");
    setModuleName("");
    setDescription("");
    setTrainingContent("");
    setBusinessContext("");
    setInitialDates([]);
    setPendingDateValue("");
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!companyId || !batchName.trim() || creatingBusy) return;
    setCreatingBusy(true);
    setError(null);
    try {
      const result = await createCohort({
        batchName,
        moduleName: moduleName || undefined,
        description: description || undefined,
        trainingContent: role === "superadmin" ? trainingContent || undefined : undefined,
        businessContext: role === "superadmin" ? businessContext || undefined : undefined,
        initialDate: initialDates[0] || undefined,
        companyId,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.id && initialDates.length > 1) {
        // First date was already seeded by createCohort; add the rest.
        await Promise.all(initialDates.slice(1).map((date) => addCohortDate(result.id!, date)));
      }
      setBatchName("");
      setModuleName("");
      setDescription("");
      setTrainingContent("");
      setBusinessContext("");
      setInitialDates([]);
      setPendingDateValue("");
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
          <div className="cohort-admin-company-heading">
            <span>{company?.logoUrl ? <img src={company.logoUrl} alt={`${company.name} logo`} /> : <Building2 size={24} />}</span>
            <div><h1>{company?.name || "Cohort management"}</h1><strong>Cohort management</strong></div>
          </div>
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
                    <span className="cohort-admin-cohort-mark">{cohort.logoUrl ? <img src={cohort.logoUrl} alt="" /> : initials(cohort.batchName)}</span>
                    <span className="cohort-admin-row-copy">
                      <strong>{cohort.batchName}</strong>
                      {cohort.moduleName && <span className="cohort-admin-row-module">{cohort.moduleName}</span>}
                      <span>{cohort.description || formatStartDate(nextUpcomingCohortDate(cohort.dates))}</span>
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
              role={role}
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
              <div>
                <p className="cohort-admin-eyebrow">New learning group</p>
                <h2 id="new-cohort-title">Create a cohort</h2>
                {role === "superadmin" && company && (
                  <p className="cohort-admin-modal-company">
                    <Building2 size={12} /> Creating for <strong>{company.name}</strong>
                  </p>
                )}
              </div>
              <button type="button" onClick={closeCreateDialog} disabled={creatingBusy} aria-label="Close"><X size={18} /></button>
            </div>
            <form id="new-cohort-form" className="cohort-admin-modal-scroll" onSubmit={handleCreate}>
              <p className="cohort-admin-form-section">Identity</p>
              <label className="cohort-admin-field">
                <span>Batch name <em>Required</em></span>
                <input autoFocus value={batchName} onChange={(event) => setBatchName(event.target.value)} placeholder="e.g. January 2026 Leadership Batch" required />
              </label>
              <label className="cohort-admin-field">
                <span>Module name <em>Optional</em></span>
                <input value={moduleName} onChange={(event) => setModuleName(event.target.value)} placeholder="e.g. Communication skills" />
              </label>
              {batchName.trim() && (
                <p className="cohort-admin-name-preview">
                  Shown as <strong>{batchName.trim()}{moduleName.trim() ? ` — ${moduleName.trim()}` : ""}</strong>
                </p>
              )}
              {duplicateCohort && (
                <div className="cohort-admin-inline-warning">
                  <AlertCircle size={14} /> A cohort with this exact batch and module already exists.
                </div>
              )}
              <label className="cohort-admin-field">
                <span>Description <em>Optional</em></span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is this cohort working towards?" rows={3} />
              </label>

              {role === "superadmin" && (
                <>
                  <p className="cohort-admin-form-section">Action generation context</p>
                  <div className="cohort-admin-notice">
                    <Info size={15} />
                    <p><strong>Used for every participant in this cohort</strong><span>Training content defines the skill. Business context keeps each action realistic for the company and its work.</span></p>
                  </div>
                  <label className="cohort-admin-field">
                    <span>Training content <em>Optional</em></span>
                    <textarea value={trainingContent} onChange={(event) => setTrainingContent(event.target.value)} placeholder="Session topics, agenda, skills, and learning outcomes" rows={4} />
                  </label>
                  <label className="cohort-admin-field">
                    <span>Business context <em>Optional</em></span>
                    <textarea value={businessContext} onChange={(event) => setBusinessContext(event.target.value)} placeholder="Company, industry, operating environment, and realistic work situations" rows={4} />
                  </label>
                </>
              )}

              <p className="cohort-admin-form-section">Schedule</p>
              <div className="cohort-admin-field">
                <span>Dates <em>Optional</em></span>
              </div>
              <div className="cohort-admin-dates-chips">
                {initialDates.length === 0 && <span className="cohort-admin-dates-empty">No dates set</span>}
                {initialDates.map((date) => (
                  <span className="cohort-admin-date-chip" key={date}>
                    {formatStartDate(date)}
                    <button type="button" onClick={() => removePendingDate(date)} aria-label={`Remove date ${formatStartDate(date)}`}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="cohort-admin-date-add">
                <input type="date" value={pendingDateValue} onChange={(event) => setPendingDateValue(event.target.value)} aria-label="Add a date" />
                <button type="button" onClick={addPendingDate} disabled={!pendingDateValue} className="cohort-admin-button cohort-admin-button--secondary">
                  <Plus size={14} /> Add date
                </button>
              </div>

              <div className="cohort-admin-modal-note"><Info size={16} /><span>You can add more dates, participants, and learning content immediately after creation.</span></div>
            </form>
            <div className="cohort-admin-modal-actions">
              <button type="button" onClick={closeCreateDialog} disabled={creatingBusy} className="cohort-admin-button cohort-admin-button--secondary">Cancel</button>
              <button type="submit" form="new-cohort-form" disabled={creatingBusy || !batchName.trim()} className="cohort-admin-button cohort-admin-button--primary">
                {creatingBusy ? <Loader2 size={16} className="cohort-admin-spin" /> : <Plus size={16} />}
                {creatingBusy ? "Creating…" : "Create cohort"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function CohortDetailPanel({
  companyId,
  cohort,
  role,
  onChange,
}: {
  companyId: string;
  cohort: CohortSummary;
  role: string;
  onChange: () => Promise<void> | void;
}) {
  const [tab, setTab] = useState<"members" | "content" | "generation" | "trainer">("members");
  const [editingNames, setEditingNames] = useState(false);
  const [editBatchName, setEditBatchName] = useState(cohort.batchName);
  const [editModuleName, setEditModuleName] = useState(cohort.moduleName ?? "");
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [members, setMembers] = useState<CohortMember[]>([]);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [tags, setTags] = useState<ParticipantTag[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [cohortDates, setCohortDates] = useState<CohortDate[]>([]);
  const [newDateValue, setNewDateValue] = useState("");
  const [libraryItems, setLibraryItems] = useState<PrepareContentItem[]>([]);
  const [assignedContentIds, setAssignedContentIds] = useState<Set<string>>(new Set());
  const [pendingAddIds, setPendingAddIds] = useState<Set<string>>(new Set());
  const [pendingContentIds, setPendingContentIds] = useState<Set<string>>(new Set());
  const [memberQuery, setMemberQuery] = useState("");
  const [contentQuery, setContentQuery] = useState("");
  const [trainingContent, setTrainingContent] = useState(cohort.trainingContent ?? "");
  const [businessContext, setBusinessContext] = useState(cohort.businessContext ?? "");
  const [trainerRoster, setTrainerRoster] = useState<Trainer[]>([]);
  const [selectedTrainerId, setSelectedTrainerId] = useState<string>(cohort.trainerId ?? "");
  const [notices, setNotices] = useState<CohortNotice[]>([]);
  const [noticeDraft, setNoticeDraft] = useState("");
  const [facilitators, setFacilitators] = useState<Facilitator[]>([]);
  const [facilitatorName, setFacilitatorName] = useState("");
  const [facilitatorDesignation, setFacilitatorDesignation] = useState("");
  const [facilitatorPdfUrl, setFacilitatorPdfUrl] = useState("");
  const [facilitatorPdfName, setFacilitatorPdfName] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Targeted, single-purpose refetchers. Each mutation below only calls the
  // one or two of these it actually invalidates, instead of reloading every
  // section of the panel (which used to make every small edit feel like a
  // full page reload).
  const fetchMembers = useCallback(async () => {
    const detailResult = await getCohortDetail(cohort.id);
    if (detailResult.error) { setError(detailResult.error); return; }
    setMembers(detailResult.members ?? []);
    setMemberIds(new Set((detailResult.members ?? []).map((member) => member.id)));
    setSelectedTrainerId(detailResult.cohort?.trainerId ?? "");
  }, [cohort.id]);

  const fetchCompanyUsers = useCallback(async () => {
    const usersResult = await getCompanyUsers(companyId);
    if (usersResult.error) { setError(usersResult.error); return; }
    setCompanyUsers(usersResult.users ?? []);
  }, [companyId]);

  const fetchContent = useCallback(async () => {
    const contentResult = await listCohortContent(cohort.id);
    if (contentResult.error) { setError(contentResult.error); return; }
    setAssignedContentIds(new Set((contentResult.items ?? []).map((item) => item.id)));
  }, [cohort.id]);

  const fetchNotices = useCallback(async () => {
    const noticesResult = await getCohortNotices(cohort.id);
    if (noticesResult.error) { setError(noticesResult.error); return; }
    setNotices(noticesResult.notices ?? []);
  }, [cohort.id]);

  const fetchFacilitators = useCallback(async () => {
    const facilitatorsResult = await listFacilitators(cohort.id);
    if (facilitatorsResult.error) { setError(facilitatorsResult.error); return; }
    setFacilitators(facilitatorsResult.facilitators ?? []);
  }, [cohort.id]);

  const fetchTags = useCallback(async () => {
    const tagsResult = await listParticipantTags();
    if (tagsResult.error) { setError(tagsResult.error); return; }
    setTags(tagsResult.tags ?? []);
  }, []);

  const fetchDates = useCallback(async () => {
    const datesResult = await listCohortDates(cohort.id);
    if (datesResult.error) { setError(datesResult.error); return; }
    setCohortDates(datesResult.dates ?? []);
  }, [cohort.id]);

  // Full load — only used when this panel first mounts for a cohort.
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detailResult, usersResult, contentResult, libraryResult, trainersResult, noticesResult, facilitatorsResult, tagsResult, datesResult] = await Promise.all([
        getCohortDetail(cohort.id),
        getCompanyUsers(companyId),
        listCohortContent(cohort.id),
        listActiveLibraryItems(),
        role === "superadmin" ? listTrainers() : Promise.resolve({ trainers: [] as Trainer[], error: undefined as string | undefined }),
        getCohortNotices(cohort.id),
        listFacilitators(cohort.id),
        listParticipantTags(),
        listCohortDates(cohort.id),
      ]);
      const firstError = detailResult.error || usersResult.error || contentResult.error || libraryResult.error || trainersResult.error || noticesResult.error || facilitatorsResult.error || tagsResult.error || datesResult.error;
      if (firstError) setError(firstError);
      setMembers(detailResult.members ?? []);
      setMemberIds(new Set((detailResult.members ?? []).map((member) => member.id)));
      setCompanyUsers(usersResult.users ?? []);
      setTags(tagsResult.tags ?? []);
      setCohortDates(datesResult.dates ?? []);
      setAssignedContentIds(new Set((contentResult.items ?? []).map((item) => item.id)));
      setLibraryItems(libraryResult.items ?? []);
      setTrainerRoster(trainersResult.trainers ?? []);
      setSelectedTrainerId(detailResult.cohort?.trainerId ?? "");
      setNotices(noticesResult.notices ?? []);
      setFacilitators(facilitatorsResult.facilitators ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load cohort details");
    } finally {
      setLoading(false);
    }
  }, [cohort.id, companyId, role]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohort.id]);

  const currentMembers = members;
  const availableUsers = useMemo(
    () => companyUsers.filter((user) => !memberIds.has(user.id)),
    [companyUsers, memberIds]
  );
  const visibleAvailableUsers = useMemo(() => {
    const needle = memberQuery.trim().toLowerCase();
    if (!needle) return availableUsers;
    return availableUsers.filter((user) =>
      `${user.full_name || "Unnamed user"} ${user.email ?? ""}`.toLowerCase().includes(needle)
    );
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

  /**
   * Run a mutation and refresh only what it actually invalidates.
   * `refetch` lists the local sections to reload (e.g. [fetchNotices]);
   * `syncList` also asks the parent to reload the sidebar/summary list —
   * only needed when the mutation changes something shown there (name,
   * logo, trainer, member/content counts, dates).
   */
  async function runMutation(
    action: string,
    mutation: () => Promise<{ error?: string }>,
    options?: {
      after?: () => void;
      refetch?: Array<() => Promise<void>>;
      syncList?: boolean;
    }
  ) {
    if (busyAction) return;
    setBusyAction(action);
    setError(null);
    try {
      const result = await mutation();
      if (result.error) {
        setError(result.error);
        return;
      }
      options?.after?.();
      if (options?.refetch?.length) {
        await Promise.all(options.refetch.map((fetcher) => fetcher()));
      }
      if (options?.syncList) {
        await onChange();
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "The update could not be completed");
    } finally {
      setBusyAction(null);
    }
  }

  const allVisibleMembersSelected = visibleAvailableUsers.length > 0 && visibleAvailableUsers.every((user) => pendingAddIds.has(user.id));
  const allVisibleContentSelected = visibleAvailableItems.length > 0 && visibleAvailableItems.every((item) => pendingContentIds.has(item.id));

  async function handleCohortLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await runMutation(
      "cohort-logo",
      async () => {
        const logoUrl = await uploadCohortLogo(cohort.id, file);
        return updateCohort(cohort.id, { logoUrl });
      },
      { syncList: true }
    );
  }

  async function handleAssignTrainer() {
    await runMutation(
      "assign-trainer",
      () => updateCohort(cohort.id, { trainerId: selectedTrainerId || null }),
      { syncList: true }
    );
  }

  async function handlePostNotice() {
    if (!noticeDraft.trim() || busyAction) return;
    await runMutation(
      "post-notice",
      async () => {
        const result = await postCohortNotice(cohort.id, noticeDraft);
        return { error: result.error };
      },
      { after: () => setNoticeDraft(""), refetch: [fetchNotices] }
    );
  }

  async function handleAddFacilitator() {
    if (!facilitatorName.trim() || !facilitatorDesignation.trim() || busyAction) return;
    await runMutation(
      "add-facilitator",
      async () => {
        const result = await createFacilitator(cohort.id, {
          name: facilitatorName,
          designation: facilitatorDesignation,
          pdfUrl: facilitatorPdfUrl || null,
          pdfName: facilitatorPdfName || null,
        });
        return { error: result.error };
      },
      {
        after: () => {
          setFacilitatorName("");
          setFacilitatorDesignation("");
          setFacilitatorPdfUrl("");
          setFacilitatorPdfName("");
        },
        refetch: [fetchFacilitators],
      }
    );
  }

  function startEditingNames() {
    setEditBatchName(cohort.batchName);
    setEditModuleName(cohort.moduleName ?? "");
    setEditingNames(true);
  }

  async function handleSaveNames() {
    if (!editBatchName.trim() || busyAction) return;
    await runMutation(
      "save-names",
      () => updateCohort(cohort.id, { batchName: editBatchName, moduleName: editModuleName }),
      { after: () => setEditingNames(false), syncList: true }
    );
  }

  async function handleAddDate(event: React.FormEvent) {
    event.preventDefault();
    if (!newDateValue || busyAction) return;
    await runMutation(
      "add-date",
      () => addCohortDate(cohort.id, newDateValue),
      { after: () => setNewDateValue(""), refetch: [fetchDates], syncList: true }
    );
  }

  async function handleDeleteCohort() {
    const displayName = cohort.moduleName ? `${cohort.batchName} — ${cohort.moduleName}` : cohort.batchName;
    if (
      !window.confirm(
        `Permanently delete “${displayName}”? Members, content assignments, and related cohort data will be removed. This cannot be undone.`
      )
    ) {
      return;
    }
    if (busyAction) return;
    setBusyAction("delete-cohort");
    setError(null);
    try {
      const result = await deleteCohort(cohort.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      await onChange();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "The update could not be completed");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="cohort-admin-detail">
      <div className="cohort-admin-detail-head">
        <div className="cohort-admin-detail-title">
          <span className="cohort-admin-cohort-mark cohort-admin-cohort-mark--large">{cohort.logoUrl ? <img src={cohort.logoUrl} alt={`${cohort.batchName} logo`} /> : initials(cohort.batchName)}</span>
          <div>
            <p className="cohort-admin-eyebrow">Active cohort</p>
            {editingNames ? (
              <div className="cohort-admin-name-edit">
                <label className="cohort-admin-field">
                  <span>Batch name <em>Required</em></span>
                  <input
                    autoFocus
                    value={editBatchName}
                    onChange={(event) => setEditBatchName(event.target.value)}
                    disabled={Boolean(busyAction)}
                  />
                </label>
                <label className="cohort-admin-field">
                  <span>Module name <em>Optional</em></span>
                  <input
                    value={editModuleName}
                    onChange={(event) => setEditModuleName(event.target.value)}
                    disabled={Boolean(busyAction)}
                  />
                </label>
                <div className="cohort-admin-name-edit-actions">
                  <button
                    type="button"
                    onClick={() => setEditingNames(false)}
                    disabled={Boolean(busyAction)}
                    className="cohort-admin-button cohort-admin-button--secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveNames()}
                    disabled={Boolean(busyAction) || !editBatchName.trim()}
                    className="cohort-admin-button cohort-admin-button--primary"
                  >
                    {busyAction === "save-names" ? <Loader2 size={15} className="cohort-admin-spin" /> : <Check size={15} />}
                    {busyAction === "save-names" ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="cohort-admin-title-row">
                  <h2>{cohort.batchName}</h2>
                  <button
                    type="button"
                    onClick={startEditingNames}
                    disabled={Boolean(busyAction)}
                    className="cohort-admin-inline-edit-btn"
                    aria-label="Edit batch and module name"
                    title="Edit batch and module name"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
                {cohort.moduleName && <p className="cohort-admin-module-name">{cohort.moduleName}</p>}
              </>
            )}
            <p>{cohort.description || "No description added."}</p>
          </div>
        </div>
        <div className="cohort-admin-detail-brand-actions">
          <label className="cohort-admin-logo-upload">
            {busyAction === "cohort-logo" ? <Loader2 size={14} className="cohort-admin-spin" /> : <ImagePlus size={14} />}
            {cohort.logoUrl ? "Replace cohort logo" : "Upload cohort logo"}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={!!busyAction} onChange={(event) => void handleCohortLogo(event)} />
          </label>
          <button
            type="button"
            onClick={() => void handleDeleteCohort()}
            disabled={Boolean(busyAction)}
            className="cohort-admin-button cohort-admin-button--danger"
            aria-label={`Delete ${cohort.batchName}`}
            title="Delete cohort"
          >
            {busyAction === "delete-cohort" ? <Loader2 size={15} className="cohort-admin-spin" /> : <Trash2 size={15} />}
            {busyAction === "delete-cohort" ? "Deleting…" : "Delete cohort"}
          </button>
        </div>
      </div>

      <div className="cohort-admin-dates-bar">
        <span className="cohort-admin-dates-label"><CalendarDays size={14} /> Dates</span>
        <div className="cohort-admin-dates-chips">
          {cohortDates.length === 0 && <span className="cohort-admin-dates-empty">No dates set</span>}
          {cohortDates.map((cohortDate) => (
            <span className="cohort-admin-date-chip" key={cohortDate.id}>
              {formatStartDate(cohortDate.date)}
              <button
                type="button"
                onClick={() => void runMutation(`remove-date:${cohortDate.id}`, () => removeCohortDate(cohort.id, cohortDate.id), { refetch: [fetchDates], syncList: true })}
                disabled={Boolean(busyAction)}
                aria-label={`Remove date ${formatStartDate(cohortDate.date)}`}
                title="Remove date"
              >
                {busyAction === `remove-date:${cohortDate.id}` ? <Loader2 size={11} className="cohort-admin-spin" /> : <X size={11} />}
              </button>
            </span>
          ))}
        </div>
        <form className="cohort-admin-date-add" onSubmit={(event) => void handleAddDate(event)}>
          <input
            type="date"
            value={newDateValue}
            onChange={(event) => setNewDateValue(event.target.value)}
            disabled={Boolean(busyAction)}
            aria-label="Add a date"
          />
          <button type="submit" disabled={Boolean(busyAction) || !newDateValue} className="cohort-admin-button cohort-admin-button--secondary">
            {busyAction === "add-date" ? <Loader2 size={14} className="cohort-admin-spin" /> : <Plus size={14} />}
            Add date
          </button>
        </form>
      </div>

      <div className="cohort-admin-tabs" role="tablist" aria-label="Cohort details">
        <button type="button" role="tab" aria-selected={tab === "members"} onClick={() => setTab("members")} className={tab === "members" ? "is-active" : ""}>
          <Users size={16} /> Members <span>{currentMembers.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === "content"} onClick={() => setTab("content")} className={tab === "content" ? "is-active" : ""}>
          <BookOpen size={16} /> Learning content <span>{assignedItems.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === "trainer"} onClick={() => setTab("trainer")} className={tab === "trainer" ? "is-active" : ""}>
          <UserRound size={16} /> Trainer <span>{notices.length}</span>
        </button>
        {role === "superadmin" && (
          <button type="button" role="tab" aria-selected={tab === "generation"} onClick={() => setTab("generation")} className={tab === "generation" ? "is-active" : ""}>
            <NotebookPen size={16} /> Action context
          </button>
        )}
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
            {role === "superadmin" && (
              <form
                className="cohort-admin-tag-creator"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!newTagName.trim() || busyAction) return;
                  void runMutation("create-tag", () => createParticipantTag(newTagName), { after: () => setNewTagName(""), refetch: [fetchTags] });
                }}
              >
                <input
                  value={newTagName}
                  onChange={(event) => setNewTagName(event.target.value)}
                  placeholder="New tag, e.g. Team A"
                  aria-label="New tag name"
                  disabled={Boolean(busyAction)}
                />
                <button type="submit" disabled={Boolean(busyAction) || !newTagName.trim()} className="cohort-admin-button cohort-admin-button--secondary">
                  {busyAction === "create-tag" ? <Loader2 size={14} className="cohort-admin-spin" /> : <Plus size={14} />}
                  Add tag
                </button>
              </form>
            )}
            {currentMembers.length === 0 ? (
              <div className="cohort-admin-mini-empty"><Users size={20} /><strong>No members yet</strong><span>Select people from the company directory.</span></div>
            ) : (
              <div className="cohort-admin-people-list">
                {currentMembers.map((member) => (
                  <div key={member.id} className="cohort-admin-person">
                    <span className="cohort-admin-avatar">{initials(member.fullName)}</span>
                    <div><strong>{member.fullName || "Unnamed user"}</strong><span>{member.email || "Cohort participant"}</span></div>
                    {role === "superadmin" ? (
                      <select
                        className="cohort-admin-tag-select"
                        value={member.tag?.id ?? ""}
                        disabled={Boolean(busyAction)}
                        aria-label={`Tag for ${member.fullName || "participant"}`}
                        onChange={(event) =>
                          void runMutation(`assign-tag:${member.id}`, () => assignMemberTag(cohort.id, member.id, event.target.value || null), { refetch: [fetchMembers] })
                        }
                      >
                        <option value="">No tag</option>
                        {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                      </select>
                    ) : (
                      member.tag && <span className="cohort-admin-tag-badge">{member.tag.name}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => void runMutation(`remove-member:${member.id}`, () => removeMembersFromCohort(cohort.id, [member.id]), { refetch: [fetchMembers, fetchCompanyUsers], syncList: true })}
                      disabled={Boolean(busyAction)}
                      aria-label={`Remove ${member.fullName || "member"}`}
                      title="Remove from cohort"
                    >
                      {busyAction === `remove-member:${member.id}` ? <Loader2 size={15} className="cohort-admin-spin" /> : <X size={15} />}
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
                      <span className="cohort-admin-select-row-copy">
                        <strong>{user.full_name || "Unnamed user"}</strong>
                        {user.email && <small>{user.email}</small>}
                      </span>
                    </label>
                  ))}
                  {visibleAvailableUsers.length === 0 && <div className="cohort-admin-no-results">No participants match your search.</div>}
                </div>
                <div className="cohort-admin-panel-action">
                  <span>{pendingAddIds.size ? `${pendingAddIds.size} selected` : "Select participants to add"}</span>
                  <button type="button" onClick={() => void runMutation("add-members", () => addMembersToCohort(cohort.id, Array.from(pendingAddIds)), { after: () => setPendingAddIds(new Set()), refetch: [fetchMembers, fetchCompanyUsers], syncList: true })} disabled={Boolean(busyAction) || pendingAddIds.size === 0} className="cohort-admin-button cohort-admin-button--primary">
                    {busyAction === "add-members" ? <Loader2 size={15} className="cohort-admin-spin" /> : <UserPlus size={15} />} Add to cohort
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : tab === "content" ? (
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
                    <button type="button" onClick={() => void runMutation(`remove-content:${item.id}`, () => removeContentFromCohort(cohort.id, item.id), { refetch: [fetchContent], syncList: true })} disabled={Boolean(busyAction)} aria-label={`Remove ${item.title}`} title="Remove from cohort">
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
                  <button type="button" onClick={() => void runMutation("add-content", () => assignContentToCohort(cohort.id, Array.from(pendingContentIds)), { after: () => setPendingContentIds(new Set()), refetch: [fetchContent], syncList: true })} disabled={Boolean(busyAction) || pendingContentIds.size === 0} className="cohort-admin-button cohort-admin-button--primary">
                    {busyAction === "add-content" ? <Loader2 size={15} className="cohort-admin-spin" /> : <Plus size={15} />} Assign content
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : tab === "trainer" ? (
        <div className="cohort-admin-picker-grid">
          <section className="cohort-admin-panel">
            <div className="cohort-admin-panel-head"><div><h3>Assigned trainer</h3><p>Shown to participants on their Base Camp page.</p></div></div>
            <div className="cohort-admin-trainer-current">
              <span className="cohort-admin-avatar cohort-admin-avatar--trainer">
                {cohort.trainer?.imageUrl ? <img src={cohort.trainer.imageUrl} alt="" /> : <UserRound size={18} />}
              </span>
              <div>
                <strong>{cohort.trainer?.name || "No trainer assigned"}</strong>
                <span>{cohort.trainer ? "Running this cohort" : "Assign one from the roster below"}</span>
              </div>
            </div>
            {role === "superadmin" ? (
              trainerRoster.length === 0 ? (
                <div className="cohort-admin-mini-empty"><UserRound size={20} /><strong>No trainers yet</strong><span>Add a trainer's name and photo in Trainers first.</span></div>
              ) : (
                <div className="cohort-admin-panel-action">
                  <select
                    className="cohort-admin-trainer-select"
                    value={selectedTrainerId}
                    onChange={(event) => setSelectedTrainerId(event.target.value)}
                    disabled={Boolean(busyAction)}
                    aria-label="Assign trainer"
                  >
                    <option value="">No trainer</option>
                    {trainerRoster.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.name}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleAssignTrainer()}
                    disabled={Boolean(busyAction) || selectedTrainerId === (cohort.trainerId ?? "")}
                    className="cohort-admin-button cohort-admin-button--primary"
                  >
                    {busyAction === "assign-trainer" ? <Loader2 size={15} className="cohort-admin-spin" /> : <Check size={15} />}
                    {busyAction === "assign-trainer" ? "Saving…" : "Save trainer"}
                  </button>
                </div>
              )
            ) : (
              <div className="cohort-admin-notice"><Info size={17} /><p><strong>Only a superadmin can change this</strong><span>Ask a superadmin to assign or update this cohort's trainer.</span></p></div>
            )}
          </section>

          <section className="cohort-admin-panel">
            <div className="cohort-admin-panel-head">
              <div><h3>Notice board</h3><p>Dated notices shown to the whole cohort on Base Camp. Normally posted by the trainer once they're logged in.</p></div>
              <span>{notices.length}</span>
            </div>
            <div className="cohort-admin-tag-creator">
              <input
                value={noticeDraft}
                onChange={(event) => setNoticeDraft(event.target.value)}
                placeholder="Post a notice on the trainer's behalf"
                aria-label="New notice"
                maxLength={2000}
                disabled={Boolean(busyAction)}
              />
              <button
                type="button"
                onClick={() => void handlePostNotice()}
                disabled={Boolean(busyAction) || !noticeDraft.trim()}
                className="cohort-admin-button cohort-admin-button--secondary"
              >
                {busyAction === "post-notice" ? <Loader2 size={14} className="cohort-admin-spin" /> : <Megaphone size={14} />}
                Post
              </button>
            </div>
            {notices.length === 0 ? (
              <div className="cohort-admin-mini-empty"><MessageSquareText size={20} /><strong>No notices yet</strong><span>Notices posted here appear on every participant's Base Camp page, with the date.</span></div>
            ) : (
              <div className="cohort-admin-people-list">
                {notices.map((notice) => (
                  <div key={notice.id} className="cohort-admin-expectation-row">
                    <span className="cohort-admin-avatar">{initials(notice.authorName)}</span>
                    <div>
                      <strong>{notice.authorName}</strong>
                      <p>{notice.message}</p>
                      <small>{formatStartDate(notice.createdAt.slice(0, 10))}</small>
                    </div>
                    <button
                      type="button"
                      onClick={() => void runMutation(`delete-notice:${notice.id}`, () => deleteCohortNotice(notice.id), { refetch: [fetchNotices] })}
                      disabled={Boolean(busyAction)}
                      aria-label="Remove notice"
                      title="Remove notice"
                    >
                      {busyAction === `delete-notice:${notice.id}` ? <Loader2 size={15} className="cohort-admin-spin" /> : <X size={15} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="cohort-admin-panel">
            <div className="cohort-admin-panel-head">
              <div><h3>Facilitators</h3><p>Name, designation and an optional PDF, shown to participants for this cohort only.</p></div>
              <span>{facilitators.length}</span>
            </div>
            {role === "superadmin" && (
              <div className="cohort-admin-context-form">
                <label className="cohort-admin-field">
                  <span>Name</span>
                  <input value={facilitatorName} onChange={(event) => setFacilitatorName(event.target.value)} placeholder="Facilitator name" disabled={Boolean(busyAction)} />
                </label>
                <label className="cohort-admin-field">
                  <span>Designation</span>
                  <input value={facilitatorDesignation} onChange={(event) => setFacilitatorDesignation(event.target.value)} placeholder="e.g. Lead Facilitator, RCPL" disabled={Boolean(busyAction)} />
                </label>
                <FacilitatorPdfUploadField
                  cohortId={cohort.id}
                  onUploaded={(pdfUrl, pdfName) => {
                    setFacilitatorPdfUrl(pdfUrl);
                    setFacilitatorPdfName(pdfName);
                  }}
                  disabled={Boolean(busyAction)}
                  label={facilitatorPdfName || "Upload PDF (optional)"}
                />
                <button
                  type="button"
                  onClick={() => void handleAddFacilitator()}
                  disabled={Boolean(busyAction) || !facilitatorName.trim() || !facilitatorDesignation.trim()}
                  className="cohort-admin-button cohort-admin-button--primary"
                >
                  {busyAction === "add-facilitator" ? <Loader2 size={15} className="cohort-admin-spin" /> : <Plus size={15} />}
                  Add facilitator
                </button>
              </div>
            )}
            {facilitators.length === 0 ? (
              <div className="cohort-admin-mini-empty"><UserRound size={20} /><strong>No facilitators added</strong><span>Add facilitators running this specific cohort.</span></div>
            ) : (
              <div className="cohort-admin-people-list">
                {facilitators.map((facilitator) => (
                  <div key={facilitator.id} className="cohort-admin-person">
                    <span className="cohort-admin-avatar">{initials(facilitator.name)}</span>
                    <div><strong>{facilitator.name}</strong><span>{facilitator.designation}</span></div>
                    {facilitator.pdfUrl && (
                      <a href={facilitator.pdfUrl} target="_blank" rel="noreferrer" className="cohort-admin-button cohort-admin-button--secondary">
                        <FileText size={14} /> View PDF
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => void runMutation(`remove-facilitator:${facilitator.id}`, () => deleteFacilitator(cohort.id, facilitator.id), { refetch: [fetchFacilitators] })}
                      disabled={Boolean(busyAction)}
                      aria-label={`Remove ${facilitator.name}`}
                      title="Remove facilitator"
                    >
                      {busyAction === `remove-facilitator:${facilitator.id}` ? <Loader2 size={15} className="cohort-admin-spin" /> : <X size={15} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="cohort-admin-generation-context">
          <section className="cohort-admin-panel">
            <div className="cohort-admin-panel-head">
              <div><h3>Action generation context</h3><p>These cohort-level inputs are combined with each participant&apos;s private notes.</p></div>
            </div>
            <div className="cohort-admin-context-form">
              <div className="cohort-admin-notice"><Info size={17} /><p><strong>Used for every participant in this cohort</strong><span>Training content defines the skill. Business context keeps each action realistic for the company and its work.</span></p></div>
              <label className="cohort-admin-field">
                <span>Training content <em>Optional</em></span>
                <textarea value={trainingContent} onChange={(event) => setTrainingContent(event.target.value)} placeholder="Add session topics, agenda, skills, and learning outcomes" rows={8} disabled={Boolean(busyAction)} />
              </label>
              <label className="cohort-admin-field">
                <span>Business context <em>Optional</em></span>
                <textarea value={businessContext} onChange={(event) => setBusinessContext(event.target.value)} placeholder="Add the company, industry, nature of the business, and realistic work situations" rows={8} disabled={Boolean(busyAction)} />
              </label>
              <div className="cohort-admin-context-actions">
                <span>{trainingContent.trim() || businessContext.trim() ? "Saved context improves action quality" : "Optional — actions can still generate from participant notes"}</span>
                <button
                  type="button"
                  onClick={() => void runMutation("save-generation-context", () => updateCohort(cohort.id, { trainingContent, businessContext }))}
                  disabled={Boolean(busyAction)}
                  className="cohort-admin-button cohort-admin-button--primary"
                >
                  {busyAction === "save-generation-context" ? <Loader2 size={15} className="cohort-admin-spin" /> : <Check size={15} />}
                  {busyAction === "save-generation-context" ? "Saving…" : "Save context"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
