"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, MessageCircle } from "lucide-react";
import { sendCohortMessage } from "@/app/actions/cohort-chat";
import { createClient } from "@/lib/supabase/client";
import type { CohortMessage } from "@/lib/types";

type CohortMessagesResponse = {
  error?: string;
  messages?: CohortMessage[];
  currentUserId?: string;
  currentUserName?: string;
  currentUserRole?: CohortMessage["senderRole"];
};

type RealtimeMessageRow = {
  id: string;
  cohort_id: string;
  sender_id: string;
  message: string;
  created_at: string;
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
  const [connectionState, setConnectionState] = useState<"connecting" | "live" | "offline">("connecting");
  const endRef = useRef<HTMLDivElement>(null);
  const refreshInFlight = useRef(false);
  const refreshQueued = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);
  const senderDirectoryRef = useRef(new Map<string, Pick<CohortMessage, "senderName" | "senderRole">>());
  const newestMessageId = messages.at(-1)?.id;

  const loadMessages = useCallback(async (quiet = false, signal?: AbortSignal) => {
    if (refreshInFlight.current) {
      refreshQueued.current = true;
      return;
    }
    refreshInFlight.current = true;
    if (!quiet) setLoading(true);
    try {
      do {
        refreshQueued.current = false;
        const response = await fetch(`/api/cohort-chat?cohortId=${encodeURIComponent(cohortId)}`, {
          method: "GET",
          cache: "no-store",
          signal,
        });
        const result = await response.json() as CohortMessagesResponse;
        if (result.error) {
          setError(result.error);
        } else {
          const nextMessages = result.messages ?? [];
          for (const message of nextMessages) {
            senderDirectoryRef.current.set(message.senderId, {
              senderName: message.senderName,
              senderRole: message.senderRole,
            });
          }
          currentUserIdRef.current = result.currentUserId ?? null;
          if (currentUserIdRef.current) {
            senderDirectoryRef.current.set(currentUserIdRef.current, {
              senderName: result.currentUserName ?? "You",
              senderRole: result.currentUserRole ?? "participant",
            });
          }
          setMessages(nextMessages);
          setCurrentUserId(currentUserIdRef.current);
          setError(null);
        }
      } while (refreshQueued.current && !signal?.aborted);
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
    const controller = new AbortController();
    const supabase = createClient();
    setConnectionState("connecting");

    const channel = supabase
      .channel(`cohort-conversation:${cohortId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "cohort_messages",
          filter: `cohort_id=eq.${cohortId}`,
        },
        (payload) => {
          const row = payload.new as RealtimeMessageRow;
          const knownSender = senderDirectoryRef.current.get(row.sender_id);
          const own = row.sender_id === currentUserIdRef.current;
          const realtimeMessage: CohortMessage = {
            id: row.id,
            cohortId: row.cohort_id,
            senderId: row.sender_id,
            senderName: knownSender?.senderName ?? (own ? "You" : "Cohort member"),
            senderRole: knownSender?.senderRole ?? "participant",
            message: row.message,
            createdAt: row.created_at,
          };
          setMessages((current) => current.some((message) => message.id === row.id)
            ? current
            : [...current, realtimeMessage].slice(-200));
          setError(null);

          // The message body is delivered by WebSocket. Only resolve history
          // once when a previously unseen sender needs their display details.
          if (!knownSender && !own) void loadMessages(true, controller.signal);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnectionState("live");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnectionState("offline");
        }
      });

    // History is fetched once; new messages arrive through the cohort-filtered
    // Realtime channel above instead of a recurring refresh timer.
    void loadMessages(false, controller.signal);
    return () => {
      controller.abort();
      refreshInFlight.current = false;
      refreshQueued.current = false;
      void supabase.removeChannel(channel);
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
      if (connectionState !== "live") await loadMessages(true);
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
        <span className={connectionState}><i />{connectionState === "live" ? "Live" : connectionState === "connecting" ? "Connecting" : "Offline"}</span>
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
