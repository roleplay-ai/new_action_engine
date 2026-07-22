"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, MessageCircle } from "lucide-react";
import { sendCohortMessage } from "@/app/actions/cohort-chat";
import type { CohortMessage } from "@/lib/types";

type CohortMessagesResponse = {
  error?: string;
  messages?: CohortMessage[];
  currentUserId?: string;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "CM";
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return date.toLocaleString("en-GB", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function CohortChat({ cohortId, memberCount }: { cohortId: string; memberCount: number }) {
  const [messages, setMessages] = useState<CohortMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const refreshInFlight = useRef(false);
  const newestMessageId = messages.at(-1)?.id;

  const loadMessages = useCallback(async (quiet = false, signal?: AbortSignal) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/cohort-chat?cohortId=${encodeURIComponent(cohortId)}`, {
        method: "GET",
        cache: "no-store",
        signal,
      });
      const result = await response.json() as CohortMessagesResponse;
      if (result.error) {
        setError(result.error);
      } else {
        setMessages(result.messages ?? []);
        setCurrentUserId(result.currentUserId ?? null);
        setError(null);
      }
    } catch (requestError) {
      if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
        setError("Could not refresh the conversation");
      }
    } finally {
      refreshInFlight.current = false;
      if (!quiet && !signal?.aborted) setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    const controller = new AbortController();

    const poll = async (initial = false) => {
      if (stopped) return;
      await loadMessages(!initial, controller.signal);
      if (!stopped) timer = window.setTimeout(() => void poll(false), 5000);
    };

    void poll(true);
    return () => {
      stopped = true;
      controller.abort();
      if (timer) window.clearTimeout(timer);
      refreshInFlight.current = false;
    };
  }, [loadMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: loading ? "auto" : "smooth", block: "nearest" });
  }, [newestMessageId, loading]);

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;

    setSending(true);
    setError(null);
    const result = await sendCohortMessage(cohortId, message);
    if (result.error) {
      setError(result.error);
    } else {
      setDraft("");
      await loadMessages(true);
    }
    setSending(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <article className="journey-module-card journey-chat-card">
      <div className="journey-chat-heading">
        <div>
          <h3>Cohort conversation</h3>
          <p>Messages shared by {memberCount} participant{memberCount === 1 ? "" : "s"} and your trainer.</p>
        </div>
      </div>

      <div className="journey-chat-messages" aria-live="polite" aria-label="Cohort messages">
        {loading && <div className="journey-chat-state"><LoaderCircle className="journey-chat-spinner" size={22} /> Loading conversation…</div>}
        {!loading && error && messages.length === 0 && <div className="journey-chat-state error">{error}</div>}
        {!loading && !error && messages.length === 0 && <div className="journey-chat-state"><MessageCircle size={24} /><strong>Start the conversation</strong><small>Ask a question, share an insight, or check in with your cohort.</small></div>}
        {!loading && messages.map((message) => {
          const own = message.senderId === currentUserId;
          return <div className={`journey-chat-message ${own ? "own" : ""} ${message.senderRole === "trainer" ? "trainer" : ""}`} key={message.id}>
            <div className="journey-chat-avatar">{initials(message.senderName)}</div>
            <div className="journey-chat-copy">
              <strong>{own ? "You" : message.senderName}</strong>
              <span>{message.senderRole === "trainer" ? "Trainer" : "Cohort participant"} · {formatMessageTime(message.createdAt)}</span>
              <p>{message.message}</p>
            </div>
          </div>;
        })}
        <div ref={endRef} />
      </div>

      <form className="journey-chat-composer" onSubmit={handleSubmit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={2000}
          rows={2}
          placeholder="Share a question or insight…"
          aria-label="Message your cohort and trainer"
        />
        <button type="submit" disabled={!draft.trim() || sending} aria-label="Send message">
          {sending && <LoaderCircle className="journey-chat-spinner" size={15} />}
          <span>Share</span>
        </button>
      </form>
      {error && messages.length > 0 && <p className="journey-chat-error">{error}</p>}
    </article>
  );
}
