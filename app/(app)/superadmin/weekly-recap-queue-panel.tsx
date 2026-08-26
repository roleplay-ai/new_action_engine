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
  bulkSendWeeklyRecap,
  getUpcomingWeeklyRecap,
  type UpcomingWeeklyRecap,
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

function RecapRow({
  recap,
  selected,
  onSelect,
}: {
  recap: UpcomingWeeklyRecap;
  selected: boolean;
  onSelect: (subscriptionId: string, selected: boolean) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const preview = recap.actions.slice(0, 2);
  const visibleActions = showActions ? recap.actions : preview;

  return (
    <article
      className={`rounded-xl border-2 bg-white p-3 transition-colors ${
        selected ? "border-[#23CE68] ring-2 ring-emerald-100" : "border-slate-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <label
          className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border ${
            recap.canSend
              ? "cursor-pointer border-slate-300 bg-white hover:bg-emerald-50"
              : "cursor-not-allowed border-slate-200 bg-slate-100"
          }`}
          title={recap.canSend ? "Select participant" : recap.blockedReason ?? "This recap cannot be sent"}
        >
          <input
            type="checkbox"
            checked={selected}
            disabled={!recap.canSend}
            onChange={(event) => onSelect(recap.subscriptionId, event.target.checked)}
            className="h-5 w-5 accent-[#23CE68] cursor-pointer disabled:cursor-not-allowed"
            aria-label={`Select recap for ${recap.fullName || recap.email}`}
          />
        </label>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="truncate text-sm">{recap.fullName || recap.email || "Unknown user"}</strong>
            {recap.fullName && recap.email && (
              <span className="truncate text-sm text-slate-500">{recap.email}</span>
            )}
            <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-bold uppercase text-violet-700">
              {recap.track}
            </span>
            {!recap.canSend && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold uppercase text-amber-700">
                Not sendable
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            <span className="font-semibold">{recap.cohortName}</span>
            <span>Every Friday at 4:00 PM IST</span>
          </div>

          <p className="mt-1 flex items-center gap-1 text-sm font-bold text-emerald-700">
            <CalendarClock size={12} />
            Next recap: {formatIstTime(recap.scheduledFor)}
          </p>

          {!recap.canSend ? (
            <p className="mt-2 text-sm font-semibold text-amber-700">
              {recap.blockedReason} Automatic delivery will skip this email.
            </p>
          ) : (
            <div className="mt-2 text-sm text-slate-600">
              <span className="font-bold">
                {recap.actionCount} action{recap.actionCount === 1 ? "" : "s"} still open:
              </span>{" "}
              {visibleActions.map((action, index) => (
                <span key={action.id}>
                  {index > 0 ? ", " : ""}
                  {action.title}
                </span>
              ))}
              {recap.actions.length > 2 && (
                <button
                  type="button"
                  onClick={() => setShowActions((value) => !value)}
                  className="ml-1 font-bold text-emerald-700 hover:underline"
                >
                  {showActions ? "Show less" : `+${recap.actions.length - 2} more`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default function WeeklyRecapQueuePanel({
  alwaysExpanded = false,
}: {
  alwaysExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [recaps, setRecaps] = useState<UpcomingWeeklyRecap[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function loadRecaps() {
    setLoading(true);
    setError(null);
    try {
      const response = await getUpcomingWeeklyRecap();
      if ("error" in response) {
        setError(response.error);
        return;
      }

      setRecaps(response.data);
      const sendableIds = new Set(
        response.data.filter((recap) => recap.canSend).map((recap) => recap.subscriptionId)
      );
      setSelectedIds((previous) => new Set(Array.from(previous).filter((id) => sendableIds.has(id))));
    } finally {
      setLoading(false);
    }
  }

  const panelExpanded = alwaysExpanded || expanded;

  useEffect(() => {
    if (panelExpanded) void loadRecaps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelExpanded]);

  const sendableRecaps = recaps.filter((recap) => recap.canSend);
  const allSelected =
    sendableRecaps.length > 0 && sendableRecaps.every((recap) => selectedIds.has(recap.subscriptionId));

  function selectRecap(subscriptionId: string, selected: boolean) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (selected) next.add(subscriptionId);
      else next.delete(subscriptionId);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(sendableRecaps.map((recap) => recap.subscriptionId)));
  }

  async function sendSelectedNow() {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const response = await bulkSendWeeklyRecap(Array.from(selectedIds));
      if ("error" in response) {
        setError(response.error);
        return;
      }

      setResult(
        `${response.sent} recap email${response.sent === 1 ? "" : "s"} sent${
          response.failed ? ` · ${response.failed} failed` : ""
        }${response.skipped ? ` · ${response.skipped} skipped` : ""}.`
      );
      const itemErrors = response.data
        .filter((item) => item.error)
        .map((item) => `${item.fullName || item.email || "User"}: ${item.error}`);
      await loadRecaps();
      if (itemErrors.length) setError(itemErrors.join(" · "));
    } finally {
      setSending(false);
    }
  }

  return (
    <section id="recap-emails" className="scroll-mt-24 overflow-hidden rounded-2xl border-4 border-black bg-emerald-50 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
      <div className="flex w-full items-center justify-between p-4 text-left font-black uppercase tracking-tight">
        <span className="flex items-center gap-2">
          <Mail size={18} />
          Upcoming Friday recap emails
          {recaps.length > 0 && (
            <span className="rounded-full bg-black px-2 py-0.5 text-xs font-black text-white">
              {sendableRecaps.length} ready
            </span>
          )}
        </span>
        {!alwaysExpanded && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-lg p-1 hover:bg-emerald-100"
            aria-label={expanded ? "Collapse recap queue" : "Expand recap queue"}
          >
            {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        )}
      </div>

      {panelExpanded && (
        <div className="border-t-2 border-black">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-100 px-4 py-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Every active participant · one bulk &quot;I completed all&quot; button, fixed delivery at 4:00 PM IST Fridays
              </p>
              <p className="mt-1 text-sm text-emerald-700">
                Lists whoever still has open actions right now — daily and weekly plans alike. Manual sends are logged but
                do not consume the automatic Friday claim.
              </p>
            </div>
            <button
              type="button"
              onClick={loadRecaps}
              disabled={loading || sending}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-bold uppercase text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
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
                {recaps.length} participant{recaps.length === 1 ? "" : "s"}
                {recaps[0] ? ` · Next ${formatIstTime(recaps[0].scheduledFor)}` : ""}
              </p>
              {sendableRecaps.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleAll}
                    disabled={sending}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold uppercase text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                    {allSelected ? "Clear all" : "Select all ready"}
                  </button>
                  <button
                    type="button"
                    onClick={sendSelectedNow}
                    disabled={sending || selectedIds.size === 0}
                    className="flex items-center gap-1.5 rounded-lg border-2 border-black bg-black px-3 py-2 text-xs font-bold uppercase text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    Bulk send now
                    {selectedIds.size ? ` (${selectedIds.size})` : ""}
                  </button>
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
                <Loader2 size={16} className="animate-spin" />
                Loading upcoming recap participants…
              </div>
            ) : recaps.length === 0 ? (
              <p className="py-3 text-sm italic text-slate-500">
                No participants currently have email reminders enabled.
              </p>
            ) : (
              <div className="space-y-3">
                {recaps.map((recap) => (
                  <RecapRow
                    key={recap.subscriptionId}
                    recap={recap}
                    selected={selectedIds.has(recap.subscriptionId)}
                    onSelect={selectRecap}
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
