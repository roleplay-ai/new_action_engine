"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  CalendarRange,
  EyeOff,
  Link2,
  Loader2,
  MailOpen,
  Maximize2,
  RefreshCw,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { BatchSelector } from "@/components/admin/BatchSelector";
import {
  getNudgeAudience,
  sendNudgeEmail,
  type NudgeAudience,
  type NudgeWindowDays,
} from "@/app/actions/engagement-nudge-emails";
import { renderEmailTemplate } from "@/lib/email-templates";
import {
  NUDGE_BODY_MAX,
  NUDGE_DEFAULT_CONTENT,
  NUDGE_SUBJECT_MAX,
  NUDGE_TEMPLATE_KEY,
  NUDGE_VARIABLES,
  nudgeTextHasLink,
  validateNudgeContent,
  type NudgeContent,
  type NudgeKind,
} from "@/lib/nudge-email-content";
import { NudgeTextEditor, type NudgeTextEditorHandle } from "./nudge-text-editor";

type Company = { id: string; name: string; slug: string | null };

const COPY: Record<
  NudgeKind,
  { title: string; description: string; empty: string; linkLabel: string; linkTarget: string; icon: typeof MailOpen }
> = {
  opened_no_action: {
    title: "Opened, but no action",
    description:
      "Participants who opened a reminder or Friday recap in the chosen window but completed zero actions in that same window. Everyone matching is pre-selected — untick anyone you want to leave out.",
    empty: "Nobody matches — everyone who opened an email in this window has also completed an action.",
    linkLabel: "UPDATE MY ACTIONS",
    linkTarget: "their actions page",
    icon: MailOpen,
  },
  no_plan: {
    title: "No plan yet",
    description:
      "Batch members who still haven't finalised their action plan. Everyone matching is pre-selected — untick anyone you want to leave out.",
    empty: "Nobody matches — every participant in scope has finalised a plan.",
    linkLabel: "COMPLETE MY ACTION PLAN",
    linkTarget: "their action plan",
    icon: EyeOff,
  },
};

const WINDOW_OPTIONS: { value: string; label: string; days: NudgeWindowDays }[] = [
  { value: "7", label: "Last 7 days", days: 7 },
  { value: "14", label: "Last 14 days", days: 14 },
  { value: "all", label: "Since batch start", days: null },
];

const draftStorageKey = (kind: NudgeKind) => `nudge-email-draft:${kind}`;

/** The admin's last edits survive a reload in this browser; a missing,
 * blocked or malformed draft just falls back to the default wording. */
function loadDraft(kind: NudgeKind): NudgeContent {
  try {
    const raw = window.localStorage.getItem(draftStorageKey(kind));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NudgeContent>;
      if (typeof parsed.subject === "string" && typeof parsed.body === "string") {
        return { subject: parsed.subject, body: parsed.body };
      }
    }
  } catch {
    // Storage unavailable — use the defaults.
  }
  return NUDGE_DEFAULT_CONTENT[kind];
}

function saveDraft(kind: NudgeKind, content: NudgeContent) {
  try {
    const defaults = NUDGE_DEFAULT_CONTENT[kind];
    if (content.subject === defaults.subject && content.body === defaults.body) {
      window.localStorage.removeItem(draftStorageKey(kind));
    } else {
      window.localStorage.setItem(draftStorageKey(kind), JSON.stringify(content));
    }
  } catch {
    // Non-essential convenience — ignore.
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

export default function EngagementNudgeEmailPanel({ kind, companies }: { kind: NudgeKind; companies: Company[] }) {
  const copy = COPY[kind];
  const Icon = copy.icon;
  const [companyId, setCompanyId] = useState<string | null>(companies[0]?.id ?? null);
  const [cohortId, setCohortId] = useState<string | null>(null);
  const [windowValue, setWindowValue] = useState("7");
  const [audience, setAudience] = useState<NudgeAudience | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [content, setContent] = useState<NudgeContent>(NUDGE_DEFAULT_CONTENT[kind]);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const subjectEditorRef = useRef<NudgeTextEditorHandle>(null);
  const bodyEditorRef = useRef<NudgeTextEditorHandle>(null);
  const [activeField, setActiveField] = useState<"subject" | "body">("body");

  useEffect(() => {
    setContent(loadDraft(kind));
    setDraftLoaded(true);
  }, [kind]);

  useEffect(() => {
    if (draftLoaded) saveDraft(kind, content);
  }, [kind, content, draftLoaded]);

  const contentError = validateNudgeContent(content);
  const missingLink = !nudgeTextHasLink(content.body);
  const isDefaultContent =
    content.subject === NUDGE_DEFAULT_CONTENT[kind].subject && content.body === NUDGE_DEFAULT_CONTENT[kind].body;

  const preview = useMemo(() => {
    if (!audience) return null;
    return renderEmailTemplate(NUDGE_TEMPLATE_KEY[kind], {
      ...audience.sample,
      login_url: "#",
      custom_subject: content.subject,
      custom_body: content.body,
    });
  }, [audience, kind, content]);

  function insertToken(token: string) {
    (activeField === "subject" ? subjectEditorRef : bodyEditorRef).current?.insert(token);
  }

  const windowDays = WINDOW_OPTIONS.find((option) => option.value === windowValue)?.days ?? 7;

  // A batch picked under one company is meaningless once the company
  // changes — force a fresh pick instead of silently keeping it.
  useEffect(() => {
    setCohortId(null);
  }, [companyId]);

  useEffect(() => {
    setError(null);
    if (!companyId) {
      setAudience(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getNudgeAudience(kind, companyId, cohortId, windowDays)
      .then((response) => {
        if (cancelled) return;
        if (response.error) {
          setError(response.error);
          setAudience(null);
          return;
        }
        const next = response.audience ?? null;
        setAudience(next);
        setSelected(new Set((next?.recipients ?? []).filter((r) => r.email).map((r) => r.userId)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, companyId, cohortId, windowDays, reloadToken]);

  useEffect(() => {
    if (!previewExpanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewExpanded]);

  const sendable = useMemo(() => (audience?.recipients ?? []).filter((r) => r.email), [audience]);
  const allSelected = sendable.length > 0 && sendable.every((r) => selected.has(r.userId));
  const selectedCount = sendable.filter((r) => selected.has(r.userId)).length;

  const toggle = useCallback((userId: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(sendable.map((r) => r.userId)));
  }

  async function handleSend() {
    if (!companyId || !selectedCount || contentError) return;
    const copyNote = [cc.trim() && `CC: ${cc.trim()}`, bcc.trim() && `BCC: ${bcc.trim()}`].filter(Boolean).join("\n");
    const confirmMessage =
      `Send "${copy.title}" email to ${selectedCount} participant${selectedCount === 1 ? "" : "s"} now?` +
      (copyNote
        ? `\n\n${copyNote}\n(copied on every participant's email — ${selectedCount} cop${selectedCount === 1 ? "y" : "ies"} each)`
        : "");
    if (!window.confirm(confirmMessage)) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const ids = sendable.filter((r) => selected.has(r.userId)).map((r) => r.userId);
      const response = await sendNudgeEmail(kind, companyId, cohortId, windowDays, ids, content, { cc, bcc });
      if (response.error) {
        setError(response.error);
        return;
      }
      setResult(
        `Sent to ${response.sent} recipient${response.sent === 1 ? "" : "s"}` +
          `${response.failed ? ` · ${response.failed} failed` : ""}` +
          `${response.skipped ? ` · ${response.skipped} skipped (no longer match)` : ""}.`
      );
      setReloadToken((token) => token + 1);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border-4 border-black bg-amber-50 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
      <div className="flex w-full items-center justify-between p-4 text-left font-black uppercase tracking-tight">
        <span className="flex items-center gap-2">
          <Icon size={18} />
          {copy.title}
        </span>
      </div>

      <div className="border-t-2 border-black">
        <div className="border-b border-amber-200 bg-amber-100 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Manual send only — never on a schedule</p>
          <p className="mt-1 text-sm text-amber-700">{copy.description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          {companies.length > 0 && (
            <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2">
              <Building2 size={15} className="text-slate-500" />
              <select
                value={companyId ?? ""}
                onChange={(event) => setCompanyId(event.target.value || null)}
                className="cursor-pointer bg-transparent text-sm font-semibold text-slate-800 outline-none"
                aria-label="Company"
              >
                <option value="">Select company…</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {companyId && <BatchSelector companyId={companyId} value={cohortId} onChange={setCohortId} />}
          {kind === "opened_no_action" && (
            <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2">
              <CalendarRange size={15} className="text-slate-500" />
              <select
                value={windowValue}
                onChange={(event) => setWindowValue(event.target.value)}
                className="cursor-pointer bg-transparent text-sm font-semibold text-slate-800 outline-none"
                aria-label="Time window"
              >
                {WINDOW_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {companyId && (
            <button
              type="button"
              onClick={() => setReloadToken((token) => token + 1)}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold uppercase text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          )}
        </div>

        {result && (
          <div className="mx-4 mb-3 flex items-start justify-between gap-2 rounded-lg border-2 border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="text-xs font-semibold text-emerald-800">{result}</p>
            <button type="button" onClick={() => setResult(null)} className="flex-shrink-0 text-emerald-600" aria-label="Dismiss result">
              <X size={14} />
            </button>
          </div>
        )}

        {error && (
          <div className="mx-4 mb-3 rounded-lg border-2 border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs font-bold text-red-700">{error}</p>
          </div>
        )}

        {!companyId ? (
          <p className="px-4 pb-4 text-sm italic text-slate-500">Select a company to find matching participants.</p>
        ) : loading && !audience ? (
          <div className="flex items-center gap-2 px-4 pb-4 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            Finding matching participants…
          </div>
        ) : audience ? (
          <div className="grid gap-5 px-4 pb-4">
            <div className="min-w-0">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                Recipients · {selectedCount} of {audience.recipients.length} selected
              </p>
              <div className="max-h-[360px] overflow-auto rounded-xl border border-slate-200 bg-white">
                {audience.recipients.length === 0 ? (
                  <p className="p-3 text-sm text-slate-500">{copy.empty}</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="w-8 px-3 py-2">
                          <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                        </th>
                        <th className="px-3 py-2">Participant</th>
                        {!cohortId && <th className="px-3 py-2">Batch</th>}
                        {kind === "opened_no_action" && <th className="px-3 py-2 text-right">Opens</th>}
                        {kind === "opened_no_action" && <th className="px-3 py-2 text-right">Last opened</th>}
                        <th className="px-3 py-2 text-right">Last nudged</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audience.recipients.map((recipient) => (
                        <tr key={recipient.userId} className="border-t border-slate-100">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={!!recipient.email && selected.has(recipient.userId)}
                              disabled={!recipient.email}
                              onChange={() => toggle(recipient.userId)}
                              aria-label={`Select ${recipient.name}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-semibold text-slate-800">{recipient.name}</p>
                            <p className="text-xs text-slate-500">{recipient.email ?? "No email on file"}</p>
                          </td>
                          {!cohortId && <td className="px-3 py-2 text-xs text-slate-600">{recipient.batchLabel}</td>}
                          {kind === "opened_no_action" && (
                            <td className="px-3 py-2 text-right font-bold text-slate-800">{recipient.openedCount ?? 0}</td>
                          )}
                          {kind === "opened_no_action" && (
                            <td className="px-3 py-2 text-right text-xs text-slate-600">{formatDate(recipient.lastOpenedAt)}</td>
                          )}
                          <td className="px-3 py-2 text-right text-xs text-slate-600">{formatDate(recipient.lastNudgedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <div className="min-w-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Edit email</p>
                  <button
                    type="button"
                    onClick={() => setContent(NUDGE_DEFAULT_CONTENT[kind])}
                    disabled={isDefaultContent}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold uppercase text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <RotateCcw size={12} />
                    Reset to default
                  </button>
                </div>

                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-600">Subject</span>
                <NudgeTextEditor
                  ref={subjectEditorRef}
                  value={content.subject}
                  onChange={(subject) => setContent((previous) => ({ ...previous, subject }))}
                  onFocus={() => setActiveField("subject")}
                  singleLine
                  maxLength={NUDGE_SUBJECT_MAX}
                  ariaLabel="Email subject"
                />

                <span className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Email text
                </span>
                <NudgeTextEditor
                  ref={bodyEditorRef}
                  value={content.body}
                  onChange={(body) => setContent((previous) => ({ ...previous, body }))}
                  onFocus={() => setActiveField("body")}
                  minRows={10}
                  maxLength={NUDGE_BODY_MAX}
                  ariaLabel="Email text"
                />

                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Insert into {activeField === "subject" ? "subject" : "email text"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {NUDGE_VARIABLES.map((variable) => (
                      <button
                        key={variable.key}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insertToken(`{{${variable.key}}}`)}
                        title={variable.label}
                        className="rounded-md bg-indigo-100 px-2 py-1 font-mono text-[11px] font-semibold text-indigo-800 hover:bg-indigo-200"
                      >
                        {`{{${variable.key}}}`}
                      </button>
                    ))}
                    {activeField === "body" && (
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insertToken(`[[${copy.linkLabel}]]`)}
                        className="flex items-center gap-1 rounded-md bg-amber-200 px-2 py-1 font-mono text-[11px] font-semibold text-amber-900 hover:bg-amber-300"
                      >
                        <Link2 size={11} />
                        {`[[${copy.linkLabel}]]`}
                      </button>
                    )}
                  </div>
                  <ul className="mt-2 space-y-1 text-[11px] leading-4 text-slate-500">
                    {NUDGE_VARIABLES.map((variable) => (
                      <li key={variable.key}>
                        <span className="rounded bg-indigo-100 px-1 font-mono text-indigo-800">{`{{${variable.key}}}`}</span>{" "}
                        {variable.label} — filled in per participant
                      </li>
                    ))}
                    <li>
                      <span className="rounded bg-amber-200 px-1 font-mono text-amber-900">[[Link text]]</span> their
                      auto-login link to {copy.linkTarget}
                    </li>
                    <li>
                      <span className="font-mono">**text**</span> bold · a blank line starts a new paragraph
                    </li>
                  </ul>
                </div>

                {contentError && (
                  <p className="mt-2 rounded-lg border-2 border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                    {contentError}
                  </p>
                )}
                {!contentError && missingLink && (
                  <p className="mt-2 rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-xs text-amber-800">
                    The email text has no <span className="font-mono">[[link]]</span>, so participants won&apos;t get an
                    auto-login link.
                  </p>
                )}
              </div>

              <div className="min-w-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Live preview · as {audience.recipients[0]?.name ?? "a sample participant"}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPreviewExpanded(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold uppercase text-slate-700 hover:bg-slate-50"
                  >
                    <Maximize2 size={12} />
                    Expand to view
                  </button>
                </div>
                <p className="mb-2 text-xs text-slate-500">Subject: {preview?.subject}</p>
                <iframe
                  title={`${copy.title} email preview`}
                  srcDoc={preview?.html ?? ""}
                  sandbox=""
                  className="h-[560px] w-full rounded-xl border border-slate-200 bg-white"
                />
              </div>
            </div>

            <div className="min-w-0">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-600">CC</span>
                  <input
                    type="text"
                    value={cc}
                    onChange={(event) => setCc(event.target.value)}
                    placeholder="manager@company.com, …"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-600">BCC</span>
                  <input
                    type="text"
                    value={bcc}
                    onChange={(event) => setBcc(event.target.value)}
                    placeholder="trainer@company.com, …"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
                  />
                </label>
              </div>
              {(cc.trim() || bcc.trim()) && (
                <p className="mt-2 rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-xs text-amber-800">
                  Each participant gets their own email, so CC/BCC addresses receive one copy per participant ({selectedCount}{" "}
                  total). Every copy includes that participant&apos;s auto-login link.
                </p>
              )}
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || loading || selectedCount === 0 || !!contentError}
                className="mt-3 flex items-center gap-1.5 rounded-lg border-2 border-black bg-black px-3 py-2 text-xs font-bold uppercase text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Send to {selectedCount} recipient{selectedCount === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        ) : null}

        {previewExpanded && audience && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`${copy.title} email preview`}
            onClick={() => setPreviewExpanded(false)}
          >
            <div
              className="flex h-full max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border-4 border-black bg-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b-2 border-black px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Email preview</p>
                  <p className="mt-0.5 truncate text-sm text-slate-700">Subject: {preview?.subject}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewExpanded(false)}
                  className="flex-shrink-0 rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50"
                  aria-label="Close preview"
                  autoFocus
                >
                  <X size={16} />
                </button>
              </div>
              <iframe
                title={`${copy.title} email preview (expanded)`}
                srcDoc={preview?.html ?? ""}
                sandbox=""
                className="w-full flex-1 bg-[#F6F2E6]"
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
