"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Plus, Search } from "lucide-react";
import {
  assignContentToCohort,
  getContentItemDetail,
  listCompanyContent,
  removeContentFromCohort,
  type CompanyContentItem,
} from "@/app/actions/prepare-content";
import { ContentPreviewModal, CreateContentForm, TYPE_META } from "@/components/admin/views/ContentManagementView";
import type { PrepareContentItem } from "@/lib/types";
import {
  batchLabel,
  CpError,
  CpNeedBatch,
  CpPageHeader,
  CpSaveBar,
  useControlPanelBatch,
  useReportViewReady,
  useToast,
  useUnsavedGuard,
} from "./shared";

function ContentIcon({ item }: { item: PrepareContentItem }) {
  const Icon = TYPE_META[item.type].icon;
  return <span className="cp-avatar cp-avatar--content" aria-hidden><Icon size={16} /></span>;
}

/** Which content this batch gets, picked from all the company's content. */
export function ContentPanel() {
  const { companyId, cohortId, option, loading: optionsLoading } = useControlPanelBatch();
  const [items, setItems] = useState<CompanyContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  // The draft: content to assign and content to unassign when the admin saves.
  const [toAdd, setToAdd] = useState<Set<string>>(new Set());
  const [toRemove, setToRemove] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ loading: boolean; error: string | null; item: PrepareContentItem | null } | null>(null);
  const { show, toast } = useToast();

  const load = useCallback(async () => {
    if (!cohortId || !companyId) return;
    setLoading(true);
    setError(null);
    const result = await listCompanyContent(companyId);
    if (result.error) setError(result.error);
    setItems(result.items ?? []);
    setLoading(false);
  }, [cohortId, companyId]);

  useEffect(() => {
    setTicked(new Set());
    setToAdd(new Set());
    setToRemove(new Set());
    setQuery("");
    setCreating(false);
    void load();
  }, [load]);

  const changes = toAdd.size + toRemove.size;
  useUnsavedGuard(changes > 0);
  useReportViewReady(!optionsLoading && !loading);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const isSaved = (item: CompanyContentItem) => !!cohortId && item.cohortIds.includes(cohortId);
  const inDraftBatch = (id: string) => {
    const item = itemById.get(id);
    return (!!item && isSaved(item) && !toRemove.has(id)) || toAdd.has(id);
  };

  // Content that can still be added comes first; content already in this batch sinks to the bottom.
  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const inBatch = (item: CompanyContentItem) => (!!cohortId && item.cohortIds.includes(cohortId) && !toRemove.has(item.id)) || toAdd.has(item.id);
    return items
      .filter((item) => !needle || `${item.title} ${item.description ?? ""} ${TYPE_META[item.type].label}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(inBatch(a)) - Number(inBatch(b)) || Number(!a.isActive) - Number(!b.isActive) || a.title.localeCompare(b.title));
  }, [items, query, cohortId, toAdd, toRemove]);

  if (!cohortId || !option) {
    return (
      <section className="cp-page">
        <CpPageHeader title="Training content" description="Choose which videos, quizzes and pre-reads a batch gets." />
        <CpNeedBatch loading={optionsLoading} />
      </section>
    );
  }

  const addable = [...ticked].filter((id) => !inDraftBatch(id));
  const leftRows = [
    ...items.filter(isSaved).map((item) => ({ item, isNew: false })),
    ...[...toAdd].flatMap((id) => (itemById.has(id) ? [{ item: itemById.get(id)!, isNew: true }] : [])),
  ].sort((a, b) => a.item.title.localeCompare(b.item.title));

  function moveTickedIntoDraft() {
    setToAdd((current) => {
      const next = new Set(current);
      addable.forEach((id) => (toRemove.has(id) ? null : next.add(id)));
      return next;
    });
    // Ticking content that was marked for removal just keeps it.
    setToRemove((current) => {
      const next = new Set(current);
      addable.forEach((id) => next.delete(id));
      return next;
    });
    setTicked(new Set());
  }

  function toggleRemove(id: string, isNew: boolean) {
    const update = isNew ? setToAdd : setToRemove;
    update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    const added = toAdd.size ? await assignContentToCohort(cohortId!, [...toAdd]) : {};
    let failure = added.error;
    for (const id of toRemove) {
      if (failure) break;
      failure = (await removeContentFromCohort(cohortId!, id)).error;
    }
    setSaving(false);
    if (failure) setError(`Some changes could not be saved: ${failure}`);
    else show("Training content saved.");
    setToAdd(new Set());
    setToRemove(new Set());
    await load();
  }

  async function openPreview(id: string) {
    setPreview({ loading: true, error: null, item: null });
    const { error: previewError, item } = await getContentItemDetail(id);
    setPreview({ loading: false, error: item ? null : previewError ?? "Failed to load content", item: item ?? null });
  }

  return (
    <section className="cp-page">
      <CpPageHeader
        title="Training content"
        description={<>Choose which videos, quizzes and pre-reads <strong>{batchLabel(option)}</strong> gets.</>}
        actions={
          <button type="button" className="cp-btn cp-btn--secondary" onClick={() => setCreating((value) => !value)}>
            <Plus size={15} /> New content
          </button>
        }
      />
      {error && <CpError message={error} onRetry={() => void load()} />}
      {creating && (
        <div className="cp-panel">
          <CreateContentForm
            onCreated={() => {
              setCreating(false);
              show("Content created. Tick it on the right to add it to this batch.");
              void load();
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}
      {loading && items.length === 0 ? (
        <div className="cp-loading">Loading content…</div>
      ) : (
        <div className="cp-two">
          <div className="cp-panel">
            <div className="cp-panel-head">
              <h2>Assigned to this batch</h2>
              <span className="cp-pill cp-pill--ok">{leftRows.length - toRemove.size}</span>
            </div>
            {leftRows.length === 0 ? (
              <div className="cp-empty"><BookOpen size={22} /><strong>No content yet</strong><span>Tick content on the right, then press “Add to this batch”.</span></div>
            ) : (
              <div className="cp-list cp-scroll">
                {leftRows.map(({ item, isNew }) => {
                  const removing = toRemove.has(item.id);
                  return (
                    <div key={item.id} className={`cp-person${isNew ? " cp-person--new" : ""}${removing ? " cp-person--removing" : ""}`}>
                      <ContentIcon item={item} />
                      <span className="cp-person-copy">
                        <strong>{item.title}</strong>
                        <span>
                          {removing
                            ? "Will be removed when you save"
                            : isNew
                              ? "New — not saved yet"
                              : `${TYPE_META[item.type].label}${item.isActive ? "" : " · Archived, hidden from participants"}`}
                        </span>
                      </span>
                      <button type="button" className="cp-link-btn" onClick={() => void openPreview(item.id)}>View</button>
                      <button type="button" className="cp-link-btn" disabled={saving} onClick={() => toggleRemove(item.id, isNew)}>
                        {removing ? "Keep" : isNew ? "Undo" : "Remove"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="cp-panel">
            <div className="cp-panel-head"><h2>All content in your company</h2><span className="cp-pill">{items.length}</span></div>
            <div className="cp-toolbar">
              <label className="cp-search">
                <Search size={15} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title or type" aria-label="Search content by title or type" />
              </label>
            </div>
            <div className="cp-list cp-scroll">
              {items.length === 0 && (
                <div className="cp-empty"><strong>No content in your company yet</strong><span>Press “New content” to create a video, quiz or pre-read.</span></div>
              )}
              {items.length > 0 && visibleItems.length === 0 && <div className="cp-empty"><span>No content matches your search.</span></div>}
              {visibleItems.map((item) => {
                const inBatch = inDraftBatch(item.id);
                const checked = ticked.has(item.id);
                const otherBatches = item.cohortIds.filter((id) => id !== cohortId).length;
                return (
                  <label key={item.id} className={`cp-person${inBatch ? " cp-person--in" : ""}${checked ? " cp-person--checked" : ""}`}>
                    <input
                      type="checkbox"
                      className="cp-check"
                      disabled={inBatch || !item.isActive}
                      checked={checked}
                      onChange={() =>
                        setTicked((current) => {
                          const next = new Set(current);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        })
                      }
                    />
                    <ContentIcon item={item} />
                    <span className="cp-person-copy">
                      <strong>{item.title}</strong>
                      <span>
                        {TYPE_META[item.type].label}
                        {otherBatches ? ` · in ${otherBatches} other ${otherBatches === 1 ? "batch" : "batches"}` : ""}
                      </span>
                    </span>
                    {!item.isActive ? (
                      <span className="cp-pill">Archived</span>
                    ) : toAdd.has(item.id) ? (
                      <span className="cp-pill cp-pill--ok">Added — not saved</span>
                    ) : inBatch ? (
                      <span className="cp-pill cp-pill--ok">In this batch</span>
                    ) : null}
                  </label>
                );
              })}
            </div>
            <div className="cp-add-bar">
              <span className="cp-hint">{addable.length ? <><strong>{addable.length}</strong> ticked</> : "Tick the content you want to add."}</span>
              <button type="button" className="cp-btn cp-btn--secondary" disabled={addable.length === 0 || saving} onClick={moveTickedIntoDraft}>
                <ArrowLeft size={15} /> Add {addable.length || ""} to this batch
              </button>
            </div>
          </div>
        </div>
      )}
      <CpSaveBar changes={changes} saving={saving} onSave={() => void save()} onDiscard={() => { setToAdd(new Set()); setToRemove(new Set()); setTicked(new Set()); }} />
      {preview && (
        <ContentPreviewModal loading={preview.loading} error={preview.error} item={preview.item} onClose={() => setPreview(null)} />
      )}
      {toast}
    </section>
  );
}
