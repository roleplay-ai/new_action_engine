"use client";

import { useEffect, useState } from "react";
import {
  CalendarClock,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  Square,
  X,
} from "lucide-react";
import {
  bulkSendUpcomingActionReminders,
  getUpcomingActionReminders,
  type UpcomingActionReminder,
} from "@/app/actions/action-reminders";

function formatIstTime(isoValue: string) {
  return new Date(isoValue).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
    timeZoneName: "short",
  });
}

function ReminderRow({
  reminder,
  selected,
  onSelect,
}: {
  reminder: UpcomingActionReminder;
  selected: boolean;
  onSelect: (subscriptionId: string, selected: boolean) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const preview = reminder.actions.slice(0, 2);
  const visibleActions = showActions ? reminder.actions : preview;

  return (
    <article
      className={`rounded-xl border-2 bg-white p-3 transition-colors ${
        selected
          ? "border-[#3699FC] ring-2 ring-sky-100"
          : "border-slate-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <label
          className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border ${
            reminder.canSend
              ? "cursor-pointer border-slate-300 bg-white hover:bg-sky-50"
              : "cursor-not-allowed border-slate-200 bg-slate-100"
          }`}
          title={
            reminder.canSend
              ? "Select user reminder"
              : reminder.blockedReason ?? "This reminder cannot be sent"
          }
        >
          <input
            type="checkbox"
            checked={selected}
            disabled={!reminder.canSend}
            onChange={(event) =>
              onSelect(reminder.subscriptionId, event.target.checked)
            }
            className="h-4 w-4 accent-[#3699FC]"
            aria-label={`Select reminder for ${
              reminder.fullName || reminder.email
            }`}
          />
        </label>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="truncate text-sm">
              {reminder.fullName || reminder.email || "Unknown user"}
            </strong>
            {reminder.fullName && reminder.email && (
              <span className="truncate text-[11px] text-slate-500">
                {reminder.email}
              </span>
            )}
            <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-700">
              {reminder.track}
            </span>
            {!reminder.canSend && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                Not sendable
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
            <span className="font-semibold">{reminder.cohortName}</span>
            <span>{reminder.scheduleLabel}</span>
          </div>

          <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-sky-700">
            <CalendarClock size={12} />
            Next email: {formatIstTime(reminder.scheduledFor)}
          </p>

          {!reminder.canSend ? (
            <p className="mt-2 text-[11px] font-semibold text-amber-700">
              {reminder.blockedReason} Automatic delivery will skip this email.
            </p>
          ) : (
            <div className="mt-2 text-[11px] text-slate-600">
              <span className="font-bold">
                {reminder.actionCount} action
                {reminder.actionCount === 1 ? "" : "s"} in this email:
              </span>{" "}
              {visibleActions.map((action, index) => (
                <span key={action.id}>
                  {index > 0 ? ", " : ""}
                  {action.title}
                </span>
              ))}
              {reminder.actions.length > 2 && (
                <button
                  type="button"
                  onClick={() => setShowActions((value) => !value)}
                  className="ml-1 font-bold text-sky-700 hover:underline"
                >
                  {showActions
                    ? "Show less"
                    : `+${reminder.actions.length - 2} more`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default function ActionReminderQueuePanel() {
  const [expanded, setExpanded] = useState(true);
  const [reminders, setReminders] = useState<UpcomingActionReminder[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function loadReminders() {
    setLoading(true);
    setError(null);
    try {
      const response = await getUpcomingActionReminders();
      if ("error" in response) {
        setError(response.error);
        return;
      }

      setReminders(response.data);
      const sendableIds = new Set(
        response.data
          .filter((reminder) => reminder.canSend)
          .map((reminder) => reminder.subscriptionId)
      );
      setSelectedIds(
        (previous) =>
          new Set(Array.from(previous).filter((id) => sendableIds.has(id)))
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (expanded) void loadReminders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const sendableReminders = reminders.filter((reminder) => reminder.canSend);
  const allSelected =
    sendableReminders.length > 0 &&
    sendableReminders.every((reminder) =>
      selectedIds.has(reminder.subscriptionId)
    );

  function selectReminder(subscriptionId: string, selected: boolean) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (selected) next.add(subscriptionId);
      else next.delete(subscriptionId);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(
      allSelected
        ? new Set()
        : new Set(
            sendableReminders.map((reminder) => reminder.subscriptionId)
          )
    );
  }

  async function sendSelectedNow() {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const response = await bulkSendUpcomingActionReminders(
        Array.from(selectedIds)
      );
      if ("error" in response) {
        setError(response.error);
        return;
      }

      setResult(
        `${response.sent} reminder email${
          response.sent === 1 ? "" : "s"
        } sent${response.failed ? ` · ${response.failed} failed` : ""}${
          response.skipped ? ` · ${response.skipped} skipped` : ""
        }.`
      );
      const itemErrors = response.data
        .filter((item) => item.error)
        .map(
          (item) =>
            `${item.fullName || item.email || "User"}: ${item.error}`
        );
      await loadReminders();
      if (itemErrors.length) setError(itemErrors.join(" · "));
    } finally {
      setSending(false);
    }
  }

  return (
    <section id="reminder-emails" className="scroll-mt-24 overflow-hidden rounded-2xl border-4 border-black bg-violet-50 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between p-4 text-left font-black uppercase tracking-tight transition-colors hover:bg-violet-100"
      >
        <span className="flex items-center gap-2">
          <Mail size={18} />
          Upcoming user reminder emails
          {reminders.length > 0 && (
            <span className="rounded-full bg-black px-2 py-0.5 text-[10px] font-black text-white">
              {sendableReminders.length} ready
            </span>
          )}
        </span>
        {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {expanded && (
        <div className="border-t-2 border-black">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-200 bg-violet-100 px-4 py-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-800">
                Participant-selected reminders · fixed delivery at 11:30 AM IST
              </p>
              <p className="mt-1 text-[11px] text-violet-700">
                Manual sends can be repeated whenever needed and do not consume
                the participant&apos;s automatic scheduled reminder.
              </p>
            </div>
            <button
              type="button"
              onClick={loadReminders}
              disabled={loading || sending}
              className="flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-2 text-[10px] font-bold uppercase text-violet-800 hover:bg-violet-50 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              Refresh
            </button>
          </div>

          {result && (
            <div className="mx-4 mt-3 flex items-start justify-between gap-2 rounded-lg border-2 border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-xs font-semibold text-emerald-800">{result}</p>
              <button
                type="button"
                onClick={() => setResult(null)}
                className="flex-shrink-0 text-emerald-600"
                aria-label="Dismiss result"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {error && (
            <div className="mx-4 mt-3 rounded-lg border-2 border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs font-bold text-red-700">{error}</p>
            </div>
          )}

          <div className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-600">
                {reminders.length} upcoming user reminder
                {reminders.length === 1 ? "" : "s"}
                {reminders[0]
                  ? ` · Next ${formatIstTime(reminders[0].scheduledFor)}`
                  : ""}
              </p>
              {sendableReminders.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleAll}
                    disabled={sending}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[10px] font-bold uppercase text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {allSelected ? (
                      <CheckSquare size={13} />
                    ) : (
                      <Square size={13} />
                    )}
                    {allSelected ? "Clear all" : "Select all ready"}
                  </button>
                  <button
                    type="button"
                    onClick={sendSelectedNow}
                    disabled={sending || selectedIds.size === 0}
                    className="flex items-center gap-1.5 rounded-lg border-2 border-black bg-black px-3 py-2 text-[10px] font-bold uppercase text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {sending ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Send size={13} />
                    )}
                    Bulk send now
                    {selectedIds.size ? ` (${selectedIds.size})` : ""}
                  </button>
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
                <Loader2 size={16} className="animate-spin" />
                Loading upcoming user reminders…
              </div>
            ) : reminders.length === 0 ? (
              <p className="py-3 text-sm italic text-slate-500">
                No users currently have an upcoming email reminder enabled.
              </p>
            ) : (
              <div className="space-y-3">
                {reminders.map((reminder) => (
                  <ReminderRow
                    key={reminder.subscriptionId}
                    reminder={reminder}
                    selected={selectedIds.has(reminder.subscriptionId)}
                    onSelect={selectReminder}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
