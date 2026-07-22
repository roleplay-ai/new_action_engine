"use client";

import { useState, useEffect, useTransition } from "react";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Pause,
  Play,
  Loader2,
  CalendarClock,
  CheckSquare,
  Square,
  X,
  Zap,
} from "lucide-react";
import {
  createEmailSchedule,
  getEmailSchedules,
  toggleEmailSchedule,
  deleteEmailSchedule,
  runEmailSchedulerNow,
  type EmailSchedule,
  type ScheduleType,
} from "@/app/actions/email-schedule";
import { EMAIL_TEMPLATES, type EmailTemplateKey } from "@/lib/email-templates";

// Calendar invites are triggered by individual action scheduling, not by the
// scheduler — only offer templates meant for bulk/recurring sends here.
const SCHEDULABLE_TEMPLATE_KEYS: EmailTemplateKey[] = ["weekly_challenges", "credentials"];

// ─── Types ─────────────────────────────────────────────────────────────────────

type User = {
  id: string;
  email: string;
  full_name: string;
  persistent_login_key: string | null;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const SCHEDULE_LABELS: Record<ScheduleType, string> = {
  daily: "Every day",
  weekly: "Every Monday",
  every_n_days: "Every N days",
  specific_date: "One-time (test)",
};

const SCHEDULE_BADGE_COLORS: Record<ScheduleType, string> = {
  daily: "bg-blue-100 text-blue-800",
  weekly: "bg-purple-100 text-purple-800",
  every_n_days: "bg-emerald-100 text-emerald-800",
  specific_date: "bg-amber-100 text-amber-800",
};

const STATUS_COLORS: Record<string, string> = {
  success: "text-emerald-600",
  partial: "text-amber-600",
  failed: "text-red-600",
};

// IST = UTC + 5:30 (330 minutes)
// All times are stored as UTC; the UI always shows/accepts IST.

/** Convert "HH:MM" IST → "HH:MM" UTC */
function istTimeToUtc(istTime: string): string {
  const [h, m] = istTime.split(":").map(Number);
  let mins = h * 60 + m - 330;
  if (mins < 0) mins += 1440;
  if (mins >= 1440) mins -= 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/** Convert "HH:MM" UTC → "HH:MM" IST (for display) */
function utcTimeToIst(utcTime: string): string {
  const [h, m] = utcTime.split(":").map(Number);
  let mins = h * 60 + m + 330;
  if (mins >= 1440) mins -= 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/**
 * Convert datetime-local value ("YYYY-MM-DDTHH:MM") treated as IST
 * into a UTC ISO string.
 */
function istDatetimeToUtcIso(istDatetime: string): string {
  // Parse as if the value were UTC, then subtract the IST offset
  const [datePart, timePart] = istDatetime.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const asUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(asUtcMs - 330 * 60 * 1000).toISOString();
}

/** Format a UTC ISO timestamp for display in IST */
function formatIstTime(isoStr: string | null | undefined) {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
    timeZoneName: "short",
  });
}

function scheduleDescription(s: EmailSchedule) {
  switch (s.schedule_type) {
    case "daily":
      return `Daily at ${utcTimeToIst(s.run_time_utc)} IST`;
    case "weekly":
      return `Every Monday at ${utcTimeToIst(s.run_time_utc)} IST`;
    case "every_n_days":
      return `Every ${s.interval_days} days at ${utcTimeToIst(s.run_time_utc)} IST`;
    case "specific_date":
      return `Once on ${formatIstTime(s.specific_run_at)}`;
  }
}

// ─── Create Form ───────────────────────────────────────────────────────────────

type FormState = {
  name: string;
  template_id: string;
  schedule_type: ScheduleType;
  run_time_utc: string;
  interval_days: string;
  specific_run_at: string;
  user_ids: Set<string>;
};

const DEFAULT_FORM: FormState = {
  name: "",
  template_id: SCHEDULABLE_TEMPLATE_KEYS[0],
  schedule_type: "weekly",
  run_time_utc: "10:00", // stored as IST in form, converted to UTC on submit
  interval_days: "3",
  specific_run_at: "",
  user_ids: new Set(),
};

function CreateScheduleForm({
  users,
  defaultTemplateId,
  onCreated,
  onCancel,
}: {
  users: User[];
  defaultTemplateId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>({
    ...DEFAULT_FORM,
    template_id: defaultTemplateId,
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const allSelected =
    users.length > 0 && users.every((u) => form.user_ids.has(u.id));

  function toggleUser(id: string) {
    setForm((prev) => {
      const next = new Set(prev.user_ids);
      next.has(id) ? next.delete(id) : next.add(id);
      return { ...prev, user_ids: next };
    });
  }

  function toggleAllUsers() {
    setForm((prev) => ({
      ...prev,
      user_ids: allSelected ? new Set() : new Set(users.map((u) => u.id)),
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) return setError("Name is required");
    if (!form.template_id.trim()) return setError("Template ID is required");
    if (form.user_ids.size === 0) return setError("Select at least one user");
    if (
      form.schedule_type === "specific_date" &&
      !form.specific_run_at
    )
      return setError("Pick a date and time");

    startTransition(async () => {
      const result = await createEmailSchedule({
        name: form.name.trim(),
        template_id: form.template_id.trim(),
        user_ids: Array.from(form.user_ids),
        schedule_type: form.schedule_type,
        // form stores IST; convert to UTC before saving
        run_time_utc: istTimeToUtc(form.run_time_utc),
        interval_days:
          form.schedule_type === "every_n_days"
            ? parseInt(form.interval_days, 10)
            : undefined,
        specific_run_at:
          form.schedule_type === "specific_date"
            ? istDatetimeToUtcIso(form.specific_run_at)
            : undefined,
      });

      if ("error" in result && result.error) {
        setError(result.error);
      } else {
        onCreated();
      }
    });
  }

  const inputClass =
    "w-full px-3 py-2 border-2 border-black rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#3699FC]";
  const labelClass = "block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-white border-t-2 border-black">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-tight">New Schedule</p>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 hover:bg-slate-100 rounded"
        >
          <X size={16} />
        </button>
      </div>

      {/* Row 1: Name + Template ID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Schedule name *</label>
          <input
            className={inputClass}
            placeholder="e.g. Weekly nudge"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className={labelClass}>Email template *</label>
          <select
            className={inputClass}
            value={form.template_id}
            onChange={(e) => setForm((p) => ({ ...p, template_id: e.target.value }))}
            required
          >
            {SCHEDULABLE_TEMPLATE_KEYS.map((key) => (
              <option key={key} value={key}>
                {EMAIL_TEMPLATES[key].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 2: Schedule type */}
      <div>
        <label className={labelClass}>Schedule type *</label>
        <div className="flex flex-wrap gap-2">
          {(["weekly", "specific_date"] as ScheduleType[]).map(
            (type) => (
              <button
                key={type}
                type="button"
                onClick={() => setForm((p) => ({ ...p, schedule_type: type }))}
                className={`px-3 py-1.5 border-2 border-black rounded-lg text-xs font-bold uppercase transition-colors ${
                  form.schedule_type === type
                    ? "bg-black text-white"
                    : "bg-white text-black hover:bg-slate-100"
                }`}
              >
                {SCHEDULE_LABELS[type]}
              </button>
            )
          )}
        </div>
      </div>

      {/* Row 3: Time / date pickers — contextual */}
      {form.schedule_type !== "specific_date" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Run time (IST) *</label>
            <input
              type="time"
              className={inputClass}
              value={form.run_time_utc}
              onChange={(e) => setForm((p) => ({ ...p, run_time_utc: e.target.value }))}
              required
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Stored as UTC ({istTimeToUtc(form.run_time_utc)} UTC)
            </p>
          </div>
        </div>
      )}

      {form.schedule_type === "specific_date" && (
        <div>
          <label className={labelClass}>Date &amp; time (IST) *</label>
          <input
            type="datetime-local"
            className={inputClass}
            value={form.specific_run_at}
            onChange={(e) =>
              setForm((p) => ({ ...p, specific_run_at: e.target.value }))
            }
            required
          />
          <p className="text-[10px] text-slate-500 mt-1">
            Enter time in IST — saved as UTC internally. Fires once, then auto-deactivates.
          </p>
        </div>
      )}

      {/* Row 4: User selection */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={labelClass}>Select recipients *</label>
          <button
            type="button"
            onClick={toggleAllUsers}
            className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-500 hover:text-slate-800"
          >
            {allSelected ? <CheckSquare size={12} /> : <Square size={12} />}
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div className="max-h-40 overflow-y-auto border-2 border-black rounded-lg divide-y divide-slate-100">
          {users.length === 0 ? (
            <p className="p-3 text-xs text-slate-400 italic">No users found.</p>
          ) : (
            users.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={form.user_ids.has(u.id)}
                  onChange={() => toggleUser(u.id)}
                  className="accent-black"
                />
                <span className="flex-1 min-w-0">
                  <span className="text-xs font-semibold truncate block">{u.email}</span>
                  {u.full_name && (
                    <span className="text-[10px] text-slate-400">{u.full_name}</span>
                  )}
                </span>
                {!u.persistent_login_key && (
                  <span className="text-[10px] text-amber-600 font-bold">No key</span>
                )}
              </label>
            ))
          )}
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          {form.user_ids.size} user{form.user_ids.size !== 1 ? "s" : ""} selected
        </p>
      </div>

      {error && (
        <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border-2 border-black rounded-lg text-xs font-bold uppercase hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2 bg-black text-white border-2 border-black rounded-lg text-xs font-bold uppercase disabled:opacity-50 hover:bg-slate-800"
        >
          {isPending && <Loader2 size={14} className="animate-spin" />}
          Create schedule
        </button>
      </div>
    </form>
  );
}

// ─── Schedule Row ─────────────────────────────────────────────────────────────

function ScheduleRow({
  schedule,
  onToggle,
  onDelete,
}: {
  schedule: EmailSchedule;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex flex-wrap items-start gap-3 p-3 bg-white border-2 border-black rounded-xl">
      {/* Status dot */}
      <div
        className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${
          schedule.is_active ? "bg-emerald-500" : "bg-slate-300"
        }`}
        title={schedule.is_active ? "Active" : "Paused"}
      />

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-sm truncate">{schedule.name}</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
              SCHEDULE_BADGE_COLORS[schedule.schedule_type]
            }`}
          >
            {SCHEDULE_LABELS[schedule.schedule_type]}
          </span>
          {!schedule.is_active && schedule.schedule_type === "specific_date" && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-500">
              Completed
            </span>
          )}
        </div>

        <p className="text-[11px] text-slate-500">{scheduleDescription(schedule)}</p>
        <p className="text-[11px] text-slate-400">
          Template:{" "}
          <span className="font-mono">
            {(EMAIL_TEMPLATES as Record<string, { label: string }>)[schedule.template_id]?.label ??
              schedule.template_id}
          </span>
          {" · "}
          {schedule.user_ids.length} recipient{schedule.user_ids.length !== 1 ? "s" : ""}
        </p>

        {schedule.is_active && (
          <p className="text-[11px] text-slate-500">
            Next run:{" "}
            <span className="font-semibold">{formatIstTime(schedule.next_run_at)}</span>
          </p>
        )}

        {schedule.last_run_at && (
          <p className="text-[11px] text-slate-400">
            Last run: {formatIstTime(schedule.last_run_at)}{" "}
            {schedule.last_run_status && (
              <span
                className={`font-bold ${
                  STATUS_COLORS[schedule.last_run_status] ?? "text-slate-500"
                }`}
              >
                ({schedule.last_run_status} · {schedule.last_run_sent} sent
                {schedule.last_run_failed > 0
                  ? `, ${schedule.last_run_failed} failed`
                  : ""}
                )
              </span>
            )}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Pause / Resume — not for completed one-time */}
        {!(schedule.schedule_type === "specific_date" && !schedule.is_active) && (
          <button
            type="button"
            onClick={() => onToggle(schedule.id, !schedule.is_active)}
            title={schedule.is_active ? "Pause" : "Resume"}
            className={`p-2 border-2 border-black rounded-lg text-[10px] font-bold uppercase ${
              schedule.is_active
                ? "bg-amber-100 hover:bg-amber-200 text-amber-800"
                : "bg-emerald-100 hover:bg-emerald-200 text-emerald-800"
            }`}
          >
            {schedule.is_active ? <Pause size={14} /> : <Play size={14} />}
          </button>
        )}

        {/* Delete */}
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onDelete(schedule.id)}
              className="px-2 py-1.5 bg-red-500 text-white border-2 border-black rounded-lg text-[10px] font-bold uppercase hover:bg-red-600"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-1.5 border-2 border-black rounded-lg text-[10px] font-bold uppercase hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            title="Delete schedule"
            className="p-2 border-2 border-black rounded-lg hover:bg-red-50 text-red-600"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function EmailSchedulerPanel({ users }: { users: User[] }) {
  const [expanded, setExpanded] = useState(false);
  const [schedules, setSchedules] = useState<EmailSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  const defaultTemplateId = SCHEDULABLE_TEMPLATE_KEYS[0];

  async function loadSchedules() {
    setLoading(true);
    setActionError(null);
    try {
      const result = await getEmailSchedules();
      if ("data" in result) setSchedules(result.data);
      else if (result.error) setActionError(result.error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (expanded) loadSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  async function handleToggle(id: string, active: boolean) {
    setActionError(null);
    const result = await toggleEmailSchedule(id, active);
    if ("error" in result && result.error) {
      setActionError(result.error);
    } else {
      setSchedules((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_active: active } : s))
      );
    }
  }

  async function handleRunNow() {
    setRunning(true);
    setRunResult(null);
    setActionError(null);
    try {
      const result = await runEmailSchedulerNow();
      if ("error" in result && result.error) {
        setActionError(result.error);
      } else {
        const processed = result.processed ?? 0;
        if (processed === 0) {
          setRunResult("No due schedules right now.");
        } else {
          const summary = (result.results ?? [])
            .map((r) => `${r.name}: ${r.sent} sent${r.failed ? `, ${r.failed} failed` : ""}`)
            .join(" · ");
          setRunResult(`Ran ${processed} schedule${processed !== 1 ? "s" : ""}. ${summary}`);
        }
        void loadSchedules();
      }
    } finally {
      setRunning(false);
    }
  }

  async function handleDelete(id: string) {
    setActionError(null);
    const result = await deleteEmailSchedule(id);
    if ("error" in result && result.error) {
      setActionError(result.error);
    } else {
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    }
  }

  const activeCount = schedules.filter((s) => s.is_active).length;

  return (
    <div className="border-4 border-black rounded-2xl overflow-hidden bg-sky-50 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left font-black uppercase tracking-tight hover:bg-sky-100 transition-colors"
      >
        <span className="flex items-center gap-2">
          <CalendarClock size={18} />
          Email Scheduler
          {schedules.length > 0 && (
            <span className="px-2 py-0.5 bg-black text-white text-[10px] font-black rounded-full">
              {activeCount} active
            </span>
          )}
        </span>
        {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {expanded && (
        <div className="border-t-2 border-black">
          {/* Info bar */}
          <div className="px-4 py-2 bg-sky-100 border-b border-sky-200 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-bold text-sky-800 uppercase tracking-wider">
              Vercel cron fires daily at 8:30 PM IST (15:00 UTC) ·{" "}
              <code className="bg-sky-200 px-1 rounded">next_run_at &le; now</code>{" "}
              triggers send
            </p>
            <button
              type="button"
              onClick={handleRunNow}
              disabled={running}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-black text-white border-2 border-black rounded-lg text-[10px] font-bold uppercase hover:bg-slate-800 disabled:opacity-50"
            >
              {running ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Zap size={12} />
              )}
              Run now
            </button>
          </div>

          {/* Run result toast */}
          {runResult && (
            <div className="mx-4 mt-3 flex items-start justify-between gap-2 px-3 py-2 bg-emerald-50 border-2 border-emerald-200 rounded-lg">
              <p className="text-xs font-semibold text-emerald-800">{runResult}</p>
              <button
                type="button"
                onClick={() => setRunResult(null)}
                className="text-emerald-500 hover:text-emerald-700 flex-shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Error banner */}
          {actionError && (
            <div className="mx-4 mt-3 px-3 py-2 bg-red-50 border-2 border-red-200 rounded-lg">
              <p className="text-xs font-bold text-red-700">{actionError}</p>
            </div>
          )}

          {/* Schedule list */}
          <div className="p-4 space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 size={16} className="animate-spin" />
                Loading schedules…
              </div>
            ) : schedules.length === 0 ? (
              <p className="text-sm text-slate-500 italic">
                No schedules yet. Create one below.
              </p>
            ) : (
              schedules.map((s) => (
                <ScheduleRow
                  key={s.id}
                  schedule={s}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))
            )}

            {/* Add button */}
            {!showCreate && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 border-2 border-black rounded-xl text-xs font-bold uppercase bg-white hover:bg-slate-50 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                <Plus size={14} />
                New schedule
              </button>
            )}
          </div>

          {/* Create form */}
          {showCreate && (
            <CreateScheduleForm
              users={users}
              defaultTemplateId={defaultTemplateId}
              onCreated={() => {
                setShowCreate(false);
                loadSchedules();
              }}
              onCancel={() => setShowCreate(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
