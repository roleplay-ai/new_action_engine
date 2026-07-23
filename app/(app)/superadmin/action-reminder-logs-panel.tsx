"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Loader2, RefreshCw, Mail, CheckCircle2, XCircle } from "lucide-react";
import { getActionReminderLogs, type ActionReminderLog } from "@/app/actions/action-reminders";

function formatIstTime(isoStr: string) {
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

function LogRow({ log }: { log: ActionReminderLog }) {
  const [expanded, setExpanded] = useState(false);
  const preview = log.actions.slice(0, 2);
  const remaining = log.actions.length - preview.length;

  return (
    <div className="flex flex-wrap items-start gap-3 p-3 bg-white border-2 border-black rounded-xl">
      <div className="mt-1 flex-shrink-0" title={log.status === "sent" ? "Sent" : "Failed"}>
        {log.status === "sent" ? (
          <CheckCircle2 size={18} className="text-emerald-500" />
        ) : (
          <XCircle size={18} className="text-red-500" />
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-sm truncate">{log.fullName || log.email}</span>
          {log.fullName && (
            <span className="text-[11px] text-slate-400 truncate">{log.email}</span>
          )}
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
              log.status === "sent"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {log.status}
          </span>
        </div>

        <p className="text-[11px] text-slate-500">
          Sent {formatIstTime(log.createdAt)}
          {log.cohortName ? ` · ${log.cohortName}` : ""}
        </p>
        {log.scheduledFor && (
          <p className="text-[10px] font-semibold text-amber-700">
            Scheduled reminder: {formatIstTime(log.scheduledFor)}
          </p>
        )}

        {log.status === "failed" && log.errorMessage && (
          <p className="text-[11px] text-red-600 font-semibold">{log.errorMessage}</p>
        )}

        {log.actionCount > 0 && (
          <div className="text-[11px] text-slate-600">
            <span className="font-semibold">{log.actionCount} action{log.actionCount === 1 ? "" : "s"}:</span>{" "}
            {(expanded ? log.actions : preview).map((a, i) => (
              <span key={a.id}>
                {i > 0 && ", "}
                {a.title}
              </span>
            ))}
            {!expanded && remaining > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="ml-1 font-bold text-sky-700 hover:underline"
              >
                +{remaining} more
              </button>
            )}
            {expanded && log.actions.length > 2 && (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="ml-1 font-bold text-sky-700 hover:underline"
              >
                Show less
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ActionReminderLogsPanel() {
  const [expanded, setExpanded] = useState(false);
  const [logs, setLogs] = useState<ActionReminderLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadLogs() {
    setLoading(true);
    setError(null);
    const result = await getActionReminderLogs();
    if ("data" in result) setLogs(result.data);
    else setError(result.error);
    setLoading(false);
  }

  useEffect(() => {
    if (expanded) loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const sentCount = logs.filter((l) => l.status === "sent").length;
  const failedCount = logs.filter((l) => l.status === "failed").length;

  return (
    <div className="border-4 border-black rounded-2xl overflow-hidden bg-amber-50 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left font-black uppercase tracking-tight hover:bg-amber-100 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Mail size={18} />
          Action Reminder History
          {logs.length > 0 && (
            <span className="px-2 py-0.5 bg-black text-white text-[10px] font-black rounded-full">
              {sentCount} sent{failedCount > 0 ? ` · ${failedCount} failed` : ""}
            </span>
          )}
        </span>
        {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {expanded && (
        <div className="border-t-2 border-black">
          <div className="px-4 py-2 bg-amber-100 border-b border-amber-200 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
              Runs daily at 11:30 AM IST · sends only on each participant&apos;s selected reminder day
            </p>
            <button
              type="button"
              onClick={loadLogs}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-black text-white border-2 border-black rounded-lg text-[10px] font-bold uppercase hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Refresh
            </button>
          </div>

          {error && (
            <div className="mx-4 mt-3 px-3 py-2 bg-red-50 border-2 border-red-200 rounded-lg">
              <p className="text-xs font-bold text-red-700">{error}</p>
            </div>
          )}

          <div className="p-4 space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 size={16} className="animate-spin" />
                Loading history…
              </div>
            ) : logs.length === 0 ? (
              <p className="text-sm text-slate-500 italic">
                No reminder emails sent yet.
              </p>
            ) : (
              logs.map((log) => <LogRow key={log.id} log={log} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
