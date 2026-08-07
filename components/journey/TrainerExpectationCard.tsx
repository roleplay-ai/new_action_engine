"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { LoaderCircle, MessageCircle, Send, UserRound } from "lucide-react";
import { saveTrainerExpectation } from "@/app/actions/trainer-expectations";
import type { Trainer, TrainerExpectationMessage } from "@/lib/types";

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return date.toLocaleString("en-GB", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function TrainerExpectationCard({
  cohortId,
  trainer,
  initialMessages,
  variant = "default",
}: {
  cohortId: string;
  trainer: Trainer | null;
  initialMessages: TrainerExpectationMessage[];
  variant?: "default" | "rcpl";
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;

    setSending(true);
    setError(null);
    const result = await saveTrainerExpectation(cohortId, message);
    if (result.error) {
      setError(result.error);
    } else if (result.message) {
      setMessages((current) => [...current, result.message!]);
      setDraft("");
    } else {
      setError("The message was sent but could not be displayed");
    }
    setSending(false);
  }

  return (
    <article className={`journey-module-card journey-trainer-card${variant === "rcpl" ? " journey-trainer-card--rcpl" : ""}`}>
      <div className="journey-trainer-heading">
        <small>Shape the room</small>
        <h3>Tell your trainer what you need</h3>
        <p>Your trainer reads every message before the session and adjusts the cases to match.</p>
      </div>

      {trainer && (
        <div className="journey-trainer-profile">
          <span className="journey-trainer-card-avatar">{trainer.imageUrl ? <img src={trainer.imageUrl} alt="" /> : <UserRound size={16} />}</span>
          <div><strong>{trainer.name}</strong><small>Your trainer for this cohort</small></div>
        </div>
      )}

      <div className="journey-chat-messages journey-trainer-messages" aria-live="polite" aria-label="Your messages to your trainer">
        {messages.length === 0 && (
          <div className="journey-chat-state">
            <MessageCircle size={22} />
            <strong>Nothing sent yet</strong>
            <small>Tell your trainer what you want from this session.</small>
          </div>
        )}
        {messages.map((message) => (
          <div className="journey-chat-message own" key={message.id}>
            <div className="journey-chat-avatar">You</div>
            <div className="journey-chat-copy">
              <div className="journey-chat-meta"><strong>You</strong><span>{formatMessageTime(message.createdAt)}</span></div>
              <p>{message.message}</p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form className="journey-chat-composer journey-trainer-composer" onSubmit={handleSubmit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={2000}
          rows={1}
          placeholder="What is the one situation you want to handle better after this session?"
          aria-label="Message your trainer"
        />
        <button type="submit" disabled={!draft.trim() || sending} aria-label="Send to trainer">
          {sending && <LoaderCircle className="journey-chat-spinner" size={15} />}
          {!sending && <Send size={15} fill="currentColor" />}
          <span>Send</span>
        </button>
      </form>
      {error && <p className="journey-trainer-error">{error}</p>}
    </article>
  );
}
