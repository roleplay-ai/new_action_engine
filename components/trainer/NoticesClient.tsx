"use client";

import { FormEvent, useState } from "react";
import { Loader2, Megaphone, Send, Trash2 } from "lucide-react";
import { deleteCohortNotice, postCohortNotice } from "@/app/actions/cohort-notices";
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
        <button type="submit" disabled={!draft.trim() || sending}>
          {sending ? <Loader2 size={15} className="trainer-spin" /> : <Send size={15} />}
          Post to batch
        </button>
      </form>
      {error && <p className="trainer-notice-error">{error}</p>}

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
