"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Loader2, Plus } from "lucide-react";
import { addCohortDate, listCohortDates, removeCohortDate, updateCohortDate } from "@/app/actions/cohorts";
import type { CohortDate } from "@/lib/types";
import { batchLabel, CpError, CpNeedBatch, CpPageHeader, useConfirm, useControlPanelBatch, useReportViewReady, useToast } from "./shared";

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatLong(date: string) {
  return new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T00:00:00`));
}

export function TrainingDatesPanel() {
  const { cohortId, option, loading: optionsLoading } = useControlPanelBatch();
  const [dates, setDates] = useState<CohortDate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newDate, setNewDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const { confirm, dialog } = useConfirm();
  const { show, toast } = useToast();

  const load = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    setError(null);
    const result = await listCohortDates(cohortId);
    if (result.error) setError(result.error);
    setDates(result.dates ?? []);
    setLoading(false);
  }, [cohortId]);

  useEffect(() => {
    setEditingId(null);
    void load();
  }, [load]);

  useReportViewReady(!optionsLoading && !loading);

  async function run(action: string, mutation: () => Promise<{ error?: string }>, success: string) {
    setBusy(action);
    setError(null);
    const result = await mutation();
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return false;
    }
    show(success);
    await load();
    return true;
  }

  if (!cohortId || !option) {
    return (
      <section className="cp-page">
        <CpPageHeader title="Add training dates" description="The training days of a batch." />
        <CpNeedBatch loading={optionsLoading} />
      </section>
    );
  }

  const today = todayIso();
  const sorted = [...dates].sort((a, b) => a.date.localeCompare(b.date));
  const next = sorted.find((item) => item.date >= today)?.id;
  const taken = (value: string, exceptId?: string) => dates.some((item) => item.date === value && item.id !== exceptId);

  return (
    <section className="cp-page">
      <CpPageHeader title="Add training dates" description={<>Training days for <strong>{batchLabel(option)}</strong>.</>} />
      {error && <CpError message={error} onRetry={() => void load()} />}
      <div className="cp-panel">
        <div className="cp-panel-head">
          <h2>Training dates</h2>
          <span className="cp-pill">{dates.length}</span>
        </div>
        {loading && dates.length === 0 ? (
          <div className="cp-loading">Loading dates…</div>
        ) : sorted.length === 0 ? (
          <div className="cp-empty"><CalendarDays size={22} /><strong>No training dates yet</strong><span>Add the first date below.</span></div>
        ) : (
          <div className="cp-list">
            {sorted.map((item) => {
              const state = item.id === next ? "next" : item.date < today ? "past" : "upcoming";
              if (editingId === item.id) {
                return (
                  <form
                    key={item.id}
                    className="cp-date-row"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (!editValue || editValue === item.date) return setEditingId(null);
                      if (taken(editValue, item.id)) return setError("That date is already in the list.");
                      const ok = await run(`edit:${item.id}`, () => updateCohortDate(cohortId, item.id, editValue), "Date changed.");
                      if (ok) setEditingId(null);
                    }}
                  >
                    <div className="cp-date-copy"><strong>Change date</strong><span>Pick the new day</span></div>
                    <input type="date" value={editValue} onChange={(event) => setEditValue(event.target.value)} aria-label="New date" autoFocus />
                    <button type="submit" className="cp-btn cp-btn--small" disabled={Boolean(busy)}>
                      {busy === `edit:${item.id}` && <Loader2 size={14} className="cp-spin" />} Save
                    </button>
                    <button type="button" className="cp-btn cp-btn--secondary cp-btn--small" onClick={() => setEditingId(null)}>Cancel</button>
                  </form>
                );
              }
              return (
                <div key={item.id} className={`cp-date-row cp-date-row--${state}`}>
                  <div className="cp-date-copy">
                    <strong>{formatLong(item.date)}</strong>
                    <span>{state === "next" ? "Next training day" : state === "past" ? "Done" : "Upcoming"}</span>
                  </div>
                  <button type="button" className="cp-btn cp-btn--secondary cp-btn--small" disabled={Boolean(busy)} onClick={() => { setEditingId(item.id); setEditValue(item.date); }}>
                    Change
                  </button>
                  <button
                    type="button"
                    className="cp-btn cp-btn--danger cp-btn--small"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      confirm({
                        title: "Remove this date?",
                        body: <>{formatLong(item.date)} will be removed from <strong>{batchLabel(option)}</strong>.</>,
                        confirmLabel: "Yes, remove",
                        danger: true,
                        onConfirm: () => run(`remove:${item.id}`, () => removeCohortDate(cohortId, item.id), "Date removed.").then(() => undefined),
                      })
                    }
                  >
                    {busy === `remove:${item.id}` && <Loader2 size={14} className="cp-spin" />} Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <form
          className="cp-add-row"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!newDate) return;
            if (taken(newDate)) return setError("That date is already in the list.");
            const ok = await run("add", () => addCohortDate(cohortId, newDate), "Date added.");
            if (ok) setNewDate("");
          }}
        >
          <label htmlFor="cp-new-date">Add a date</label>
          <input id="cp-new-date" type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} />
          <button type="submit" className="cp-btn" disabled={!newDate || Boolean(busy)}>
            {busy === "add" ? <Loader2 size={15} className="cp-spin" /> : <Plus size={15} />} Add date
          </button>
        </form>
      </div>
      {dialog}
      {toast}
    </section>
  );
}
