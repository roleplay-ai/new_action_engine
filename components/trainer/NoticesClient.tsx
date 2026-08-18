"use client";

import { FormEvent, useState } from "react";
import { Loader2, Mail, Megaphone, Send, Trash2 } from "lucide-react";
import { deleteCohortNotice, emailCohortAnnouncement, postCohortNotice } from "@/app/actions/cohort-notices";
import type { CohortNotice } from "@/lib/types";

function formatNoticeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function NoticesClient({ cohortId, initialNotices }: { cohortId: string; initialNotices: CohortNotice[] }) {
  const [notices, setNotices] = useState(initialNotices);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailing, setEmailing] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ message: string; isError: boolean } | null>(null);
  const postingBusy = sending || emailing;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    const result = await postCohortNotice(cohortId, message);
    if (result.error) {
      setError(result.error);
    } else if (result.notice) {
      setNotices((current) => [result.notice!, ...current]);
      setDraft("");
    }
    setSending(false);
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    setError(null);
    const result = await deleteCohortNotice(id);
    if (result.error) setError(result.error);
    else setNotices((current) => current.filter((notice) => notice.id !== id));
    setBusyId(null);
  }

  async function handleEmail() {
    const message = draft.trim();
    if (!message || emailing) return;
    setEmailing(true);
    setEmailStatus(null);
    const result = await emailCohortAnnouncement(cohortId, message);
    if (result.error) {
      setEmailStatus({ message: result.error, isError: true });
    } else {
      const sent = result.sent ?? 0;
      const failed = result.failed ?? 0;
      setEmailStatus({
        message: failed > 0 ? `Sent to ${sent} member${sent === 1 ? "" : "s"}, ${failed} failed` : `Sent to ${sent} member${sent === 1 ? "" : "s"}`,
        isError: false,
      });
    }
    setEmailing(false);
  }

  async function handlePostAndEmail() {
    const message = draft.trim();
    if (!message || postingBusy) return;

    setSending(true);
    setError(null);
    setEmailStatus(null);

    const postResult = await postCohortNotice(cohortId, message);
    if (postResult.error) {
      setError(postResult.error);
      setSending(false);
      return;
    }

    if (postResult.notice) {
      setNotices((current) => [postResult.notice!, ...current]);
    }

    setSending(false);
    setEmailing(true);

    const emailResult = await emailCohortAnnouncement(cohortId, message);
    if (emailResult.error) {
      setEmailStatus({ message: emailResult.error, isError: true });
    } else {
      const sent = emailResult.sent ?? 0;
      const failed = emailResult.failed ?? 0;
      setEmailStatus({
        message: failed > 0 ? `Posted and emailed ${sent} member${sent === 1 ? "" : "s"}, ${failed} failed` : `Posted and emailed ${sent} member${sent === 1 ? "" : "s"}`,
        isError: false,
      });
      setDraft("");
    }

    setEmailing(false);
  }

  return (
    <div className="trainer-notice-board">
      <form className="trainer-notice-composer" onSubmit={handleSubmit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Post an update — e.g. a room change, a reminder, or what to bring next session."
          aria-label="New notice"
        />
        <div className="trainer-notice-composer-actions">
          <button type="submit" disabled={!draft.trim() || postingBusy}>
            {sending ? <Loader2 size={15} className="trainer-spin" /> : <Send size={15} />}
            Post to batch
          </button>
          <button type="button" onClick={() => void handlePostAndEmail()} disabled={!draft.trim() || postingBusy}>
            {emailing ? <Loader2 size={15} className="trainer-spin" /> : <Mail size={15} />}
            Post and email to batch
          </button>
        </div>
      </form>
      {error && <p className="trainer-notice-error">{error}</p>}
      {emailStatus && <p className={emailStatus.isError ? "trainer-notice-error" : "trainer-notice-email-status"}>{emailStatus.message}</p>}

      {notices.length === 0 ? (
        <div className="trainer-empty">
          <Megaphone size={24} />
          <strong>No notices posted yet</strong>
          <p>Anything you post appears here and on every participant&apos;s Base Camp page, with the date.</p>
        </div>
      ) : (
        <ul className="trainer-notice-list">
          {notices.map((notice) => (
            <li key={notice.id} className="trainer-notice-row">
              <div className="trainer-notice-row-icon"><Megaphone size={15} /></div>
              <div className="trainer-notice-row-copy">
                <p>{notice.message}</p>
                <small>{formatNoticeDate(notice.createdAt)}</small>
              </div>
              <button type="button" onClick={() => void handleDelete(notice.id)} disabled={busyId === notice.id} aria-label="Delete notice" title="Delete notice">
                {busyId === notice.id ? <Loader2 size={14} className="trainer-spin" /> : <Trash2 size={14} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
