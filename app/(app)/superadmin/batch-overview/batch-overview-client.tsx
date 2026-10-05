"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2,
  CalendarRange,
  ClipboardCheck,
  ClipboardX,
  Gauge,
  Loader2,
  Lock,
  MailOpen,
  MailWarning,
  Megaphone,
  MessagesSquare,
  NotebookPen,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";
import {
  getCompanyBatchOverview,
  type BatchOverview,
  type BatchWeekStatus,
  type CompanyBatchOverview,
} from "@/app/actions/superadmin-batch-overview";
import { SelectCompanyPrompt, useSuperadminCompany } from "../superadmin-company-context";


const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatIstDate(istDate: string) {
  const [year, month, day] = istDate.split("-").map(Number);
  if (!year || !month || !day) return istDate;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function pct(part: number, total: number) {
  return total > 0 ? `${Math.round((part * 100) / total)}%` : "—";
}

function WeekBadge({ week }: { week: BatchWeekStatus }) {
  if (week.state === "not_started") {
    return (
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
        Not started{week.startsOnIst ? ` · starts ${formatIstDate(week.startsOnIst)}` : ""}
      </span>
    );
  }
  if (week.state === "finished") {
    return (
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
        Completed · {week.maxWeeks}-week programme
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
      Week {week.week}
      {week.maxWeeks ? ` of ${week.maxWeeks}` : ""} · {formatIstDate(week.weekStartIst)} – {formatIstDate(week.weekEndIst)}
    </span>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "good" | "warn";
}) {
  const toneClass =
    tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-rose-700" : "text-slate-900";
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        <Icon size={13} className="shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className={`mt-1.5 break-words text-2xl font-bold leading-none ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function BatchCard({ batch }: { batch: BatchOverview }) {
  const [tab, setTab] = useState<"none" | "conversations" | "announcements">("none");
  const toggle = (next: "conversations" | "announcements") => setTab((current) => (current === next ? "none" : next));

  return (
    <section className="superadmin-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="truncate">{batch.batchName}</span>
            {batch.locked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                <Lock size={11} /> Locked
              </span>
            )}
          </h2>
          <p className="text-sm text-slate-500">
            {batch.moduleName ?? "No module name"}
            {batch.trainerName ? ` · Trainer: ${batch.trainerName}` : ""}
          </p>
        </div>
        <WeekBadge week={batch.week} />
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3">
        <Metric icon={Users} label="Total users" value={batch.totalUsers} hint="Participants in this batch" />
        <Metric
          icon={NotebookPen}
          label="Made a plan"
          value={batch.madePlan}
          hint={`${pct(batch.madePlan, batch.totalUsers)} of batch · activated or not`}
        />
        <Metric
          icon={ClipboardCheck}
          label="Activated plan"
          value={batch.activatedPlan}
          hint={`${pct(batch.activatedPlan, batch.totalUsers)} of batch`}
          tone="good"
        />
        <Metric
          icon={ClipboardX}
          label="No plan yet"
          value={batch.noPlan}
          hint={`${pct(batch.noPlan, batch.totalUsers)} of batch · never made one`}
          tone={batch.noPlan > 0 ? "warn" : "default"}
        />
        <Metric
          icon={ClipboardX}
          label="Made, not activated"
          value={batch.draftNotActivated}
          hint="Made a plan but never activated it"
          tone={batch.draftNotActivated > 0 ? "warn" : "default"}
        />
        <Metric
          icon={Gauge}
          label="Avg commitment"
          value={batch.avgCommitmentPct != null ? `${batch.avgCommitmentPct}%` : "—"}
          hint="Among activated users"
        />
        <Metric
          icon={MailWarning}
          label="Opened, 0 validated"
          value={batch.openedNoValidation}
          hint="Open reminders/recaps but no validated action"
          tone={batch.openedNoValidation > 0 ? "warn" : "default"}
        />
        <Metric
          icon={MailOpen}
          label="Avg openers / week"
          value={batch.avgWeeklyOpeners ?? "—"}
          hint={
            batch.currentWeekOpeners != null
              ? `Reminder or recap · ${batch.currentWeekOpeners} this week`
              : "Reminder or recap"
          }
        />
        <Metric
          icon={Send}
          label="Email sender"
          value={batch.senderName}
          hint={
            batch.senderSource === "batch"
              ? "Set on the batch"
              : batch.senderSource === "trainer"
                ? "Trainer name (no batch override)"
                : "Default — no batch sender or trainer"
          }
        />
      </div>

      <div className="flex flex-wrap gap-2 border-t border-slate-200 px-5 py-3">
        <button
          type="button"
          onClick={() => toggle("conversations")}
          aria-expanded={tab === "conversations"}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold ${
            tab === "conversations" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <MessagesSquare size={14} /> Conversations ({batch.totalMessages})
        </button>
        <button
          type="button"
          onClick={() => toggle("announcements")}
          aria-expanded={tab === "announcements"}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold ${
            tab === "announcements" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Megaphone size={14} /> Announcements ({batch.notices.length})
        </button>
      </div>

      {tab === "conversations" && (
        <div className="max-h-[420px] overflow-auto border-t border-slate-200 bg-slate-50 px-5 py-4">
          {batch.messages.length === 0 ? (
            <p className="text-sm italic text-slate-500">No conversation in this batch yet.</p>
          ) : (
            <>
              {batch.totalMessages > batch.messages.length && (
                <p className="mb-3 text-xs text-slate-500">
                  Showing the latest {batch.messages.length} of {batch.totalMessages} messages.
                </p>
              )}
              <ul className="space-y-3">
                {batch.messages.map((message) => (
                  <li key={message.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <strong className="text-slate-800">{message.senderName}</strong>
                      {message.senderRole === "trainer" && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-900">Trainer</span>
                      )}
                      <span className="text-slate-400">{formatTimestamp(message.createdAt)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{message.message}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {tab === "announcements" && (
        <div className="max-h-[420px] overflow-auto border-t border-slate-200 bg-slate-50 px-5 py-4">
          {batch.notices.length === 0 ? (
            <p className="text-sm italic text-slate-500">The trainer hasn&apos;t posted any announcements.</p>
          ) : (
            <ul className="space-y-3">
              {batch.notices.map((notice) => (
                <li key={notice.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <strong className="text-slate-800">{notice.authorName}</strong>
                    <span className="text-slate-400">{formatTimestamp(notice.createdAt)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{notice.message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export default function BatchOverviewClient() {
  // Company comes from the console-wide selector in the top bar. Nothing is
  // fetched until one is picked — the overview is heavy.
  const { companies, companyId, hydrated } = useSuperadminCompany();
  const [overview, setOverview] = useState<CompanyBatchOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async (id: string) => {
    const request = ++requestRef.current;
    setOverview(null);
    setError(null);
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await getCompanyBatchOverview(id);
    // Ignore a response for a company that's no longer selected.
    if (request !== requestRef.current) return;
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOverview(result.overview ?? null);
  }, []);

  useEffect(() => {
    if (hydrated) void load(companyId);
  }, [companyId, hydrated, load]);

  if (!companies.length) {
    return (
      <div className="superadmin-empty">
        <Building2 size={26} />
        <strong>No companies yet</strong>
        <p>Create a company and its batches to see an overview here.</p>
      </div>
    );
  }

  if (!hydrated) return null;

  if (!companyId) {
    return <SelectCompanyPrompt message="Choose a company in the top bar to load the overview of its batches." />;
  }

  const batches = overview?.batches ?? [];
  const totals = batches.reduce(
    (acc, b) => ({
      users: acc.users + b.totalUsers,
      made: acc.made + b.madePlan,
      activated: acc.activated + b.activatedPlan,
      noPlan: acc.noPlan + b.noPlan,
      openedNoValidation: acc.openedNoValidation + b.openedNoValidation,
    }),
    { users: 0, made: 0, activated: 0, noPlan: 0, openedNoValidation: 0 }
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void load(companyId)}
          disabled={loading}
          className="superadmin-secondary-action inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Reload
        </button>
      </div>

      {error && (
        <div className="superadmin-alert warning">
          <strong>{error}</strong>
          <span>Try reloading, or check the service-role configuration.</span>
        </div>
      )}

      {loading && !overview && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading batches…
        </div>
      )}

      {overview && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Metric icon={CalendarRange} label="Active batches" value={batches.length} />
            <Metric icon={Users} label="Participants" value={totals.users} />
            <Metric icon={NotebookPen} label="Made a plan" value={totals.made} hint={pct(totals.made, totals.users)} />
            <Metric icon={ClipboardCheck} label="Activated plans" value={totals.activated} hint={pct(totals.activated, totals.users)} tone="good" />
            <Metric icon={ClipboardX} label="No plan yet" value={totals.noPlan} tone={totals.noPlan > 0 ? "warn" : "default"} />
            <Metric
              icon={MailWarning}
              label="Opened, 0 validated"
              value={totals.openedNoValidation}
              tone={totals.openedNoValidation > 0 ? "warn" : "default"}
            />
          </div>

          {batches.length === 0 ? (
            <div className="superadmin-empty">
              <CalendarRange size={26} />
              <strong>No active batches</strong>
              <p>{overview.companyName} has no non-archived batches yet.</p>
            </div>
          ) : (
            <div className={`grid grid-cols-1 items-start gap-5 lg:grid-cols-2 ${loading ? "opacity-60" : ""}`}>
              {batches.map((batch) => (
                <BatchCard key={batch.cohortId} batch={batch} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
