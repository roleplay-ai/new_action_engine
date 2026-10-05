"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Plus } from "lucide-react";
import { addCohortDate, listCohortDates, removeCohortDate, updateCohortDate } from "@/app/actions/cohorts";
import type { CohortDate } from "@/lib/types";
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

/** One row of the draft: a saved date (maybe changed or marked for removal) or a new one. */
type DraftDate = { key: string; savedId: string | null; savedDate: string | null; date: string; removed: boolean };

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatLong(date: string) {
  return new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T00:00:00`));
}

function toDraft(dates: CohortDate[]): DraftDate[] {
  return dates.map((item) => ({ key: item.id, savedId: item.id, savedDate: item.date, date: item.date, removed: false }));
}

export function TrainingDatesPanel() {
  const { cohortId, option, loading: optionsLoading } = useControlPanelBatch();
  const [saved, setSaved] = useState<CohortDate[]>([]);
  const [draft, setDraft] = useState<DraftDate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newDate, setNewDate] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const { show, toast } = useToast();

  const load = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    setError(null);
    const result = await listCohortDates(cohortId);
    if (result.error) setError(result.error);
    setSaved(result.dates ?? []);
    setDraft(toDraft(result.dates ?? []));
    setLoading(false);
  }, [cohortId]);

  useEffect(() => {
    setEditingKey(null);
    void load();
  }, [load]);

  const changes = useMemo(
    () => draft.filter((item) => (item.savedId ? item.removed || item.date !== item.savedDate : !item.removed)).length,
    [draft]
  );
  useUnsavedGuard(changes > 0);
  useReportViewReady(!optionsLoading && !loading);

  if (!cohortId || !option) {
    return (
      <section className="cp-page">
        <CpPageHeader title="Add training dates" description="The training days of a batch." />
        <CpNeedBatch loading={optionsLoading} />
      </section>
    );
  }

  const today = todayIso();
  const visible = [...draft].sort((a, b) => a.date.localeCompare(b.date));
  const next = visible.find((item) => !item.removed && item.date >= today)?.key;
  const taken = (value: string, exceptKey?: string) => draft.some((item) => !item.removed && item.date === value && item.key !== exceptKey);

  function addDraftDate(event: React.FormEvent) {
    event.preventDefault();
    if (!newDate) return;
    if (taken(newDate)) return setError("That date is already in the list.");
    setError(null);
    setDraft((current) => [...current, { key: `new-${Date.now()}`, savedId: null, savedDate: null, date: newDate, removed: false }]);
    setNewDate("");
  }

  function applyEdit(key: string) {
    if (!editValue) return setEditingKey(null);
    if (taken(editValue, key)) return setError("That date is already in the list.");
    setError(null);
    setDraft((current) => current.map((item) => (item.key === key ? { ...item, date: editValue } : item)));
    setEditingKey(null);
  }

  function toggleRemove(key: string) {
    setDraft((current) =>
      current
        // A date that was only added in this draft simply disappears.
        .filter((item) => !(item.key === key && !item.savedId))
        .map((item) => (item.key === key ? { ...item, removed: !item.removed } : item))
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    const steps: Array<() => Promise<{ error?: string }>> = [];
    for (const item of draft) {
      if (item.savedId && item.removed) steps.push(() => removeCohortDate(cohortId!, item.savedId!));
      else if (item.savedId && item.date !== item.savedDate) steps.push(() => updateCohortDate(cohortId!, item.savedId!, item.date));
      else if (!item.savedId && !item.removed) steps.push(() => addCohortDate(cohortId!, item.date));
    }
    for (const step of steps) {
      const result = await step();
      if (result.error) {
        setSaving(false);
        setError(`Some changes could not be saved: ${result.error}`);
        await load();
        return;
      }
    }
    setSaving(false);
    show("Training dates saved.");
    await load();
  }

  return (
    <section className="cp-page">
      <CpPageHeader title="Add training dates" description={<>Training days for <strong>{batchLabel(option)}</strong>.</>} />
      {error && <CpError message={error} onRetry={() => void load()} />}
      <div className="cp-panel">
        <div className="cp-panel-head">
          <h2>Training dates</h2>
          <span className="cp-pill">{draft.filter((item) => !item.removed).length}</span>
        </div>
        {loading && saved.length === 0 ? (
          <div className="cp-loading">Loading dates…</div>
        ) : visible.length === 0 ? (
          <div className="cp-empty"><CalendarDays size={22} /><strong>No training dates yet</strong><span>Add the first date below.</span></div>
        ) : (
          <div className="cp-list">
            {visible.map((item) => {
              if (editingKey === item.key) {
                return (
                  <form key={item.key} className="cp-date-row" onSubmit={(event) => { event.preventDefault(); applyEdit(item.key); }}>
                    <div className="cp-date-copy"><strong>Change date</strong><span>Pick the new day</span></div>
                    <input type="date" value={editValue} onChange={(event) => setEditValue(event.target.value)} aria-label="New date" autoFocus />
                    <button type="submit" className="cp-btn cp-btn--small">Done</button>
                    <button type="button" className="cp-btn cp-btn--secondary cp-btn--small" onClick={() => setEditingKey(null)}>Cancel</button>
                  </form>
                );
              }
              const isNew = !item.savedId;
              const changed = !isNew && item.date !== item.savedDate;
              const state = item.removed ? "removed" : item.key === next ? "next" : item.date < today ? "past" : "upcoming";
              return (
                <div key={item.key} className={`cp-date-row cp-date-row--${state}${isNew || changed ? " cp-date-row--pending" : ""}`}>
                  <div className="cp-date-copy">
                    <strong>{formatLong(item.date)}</strong>
                    <span>
                      {item.removed
                        ? "Will be removed when you save"
                        : isNew
                          ? "New — not saved yet"
                          : changed
                            ? `Changed from ${formatLong(item.savedDate!)} — not saved yet`
                            : state === "next" ? "Next training day" : state === "past" ? "Done" : "Upcoming"}
                    </span>
                  </div>
                  {item.removed ? (
                    <button type="button" className="cp-btn cp-btn--secondary cp-btn--small" disabled={saving} onClick={() => toggleRemove(item.key)}>Keep this date</button>
                  ) : (
                    <>
                      <button type="button" className="cp-btn cp-btn--secondary cp-btn--small" disabled={saving} onClick={() => { setEditingKey(item.key); setEditValue(item.date); }}>
                        Change
                      </button>
                      <button type="button" className="cp-btn cp-btn--danger cp-btn--small" disabled={saving} onClick={() => toggleRemove(item.key)}>
                        Remove
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <form className="cp-add-row" onSubmit={addDraftDate}>
          <label htmlFor="cp-new-date">Add a date</label>
          <input id="cp-new-date" type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} />
          <button type="submit" className="cp-btn cp-btn--secondary" disabled={!newDate || saving}>
            <Plus size={15} /> Add date
          </button>
        </form>
      </div>
      <CpSaveBar changes={changes} saving={saving} onSave={() => void save()} onDiscard={() => { setDraft(toDraft(saved)); setEditingKey(null); setError(null); }} />
      {toast}
    </section>
  );
}
