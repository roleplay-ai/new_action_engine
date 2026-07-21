"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Cloud, Lightbulb, Sparkles } from "lucide-react";
import { useEngine } from "@/lib/store";
import { getMySessionNotes, saveMySessionNotes } from "@/app/actions/session-notes";

const prompts = [
  "One idea I want to remember is…",
  "A situation where I could use this is…",
  "Something I want to try differently is…",
];

export default function NotesClient() {
  const { cohort } = useEngine();
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"loading" | "saved" | "saving" | "error">("loading");
  const [error, setError] = useState("");
  const loaded = useRef(false);

  useEffect(() => {
    getMySessionNotes(cohort?.id).then((result) => {
      setBody(result.body);
      setError(result.error ?? "");
      setStatus(result.error ? "error" : "saved");
      loaded.current = true;
    });
  }, [cohort?.id]);

  useEffect(() => {
    if (!loaded.current) return;
    setStatus("saving");
    const timer = window.setTimeout(async () => {
      const result = await saveMySessionNotes(body, cohort?.id);
      setError(result.error ?? "");
      setStatus(result.error ? "error" : "saved");
    }, 700);
    return () => window.clearTimeout(timer);
  }, [body, cohort?.id]);

  const addPrompt = useCallback((prompt: string) => {
    setBody((current) => `${current}${current.trim() ? "\n\n" : ""}${prompt} `);
  }, []);

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  return (
    <div className="journey-page notes-page">
      <div className="participant-page-heading">
        <span className="participant-eyebrow">Private workspace</span>
        <h1>My session notes</h1>
        <p>Capture what matters to you. Your notes stay private and can guide your AI action plan.</p>
      </div>
      <div className="notes-layout">
        <section className="journey-card notes-editor-card">
          <div className="notes-editor-head">
            <div><strong>{cohort?.name ?? "Learning session"}</strong><span>{words} {words === 1 ? "word" : "words"}</span></div>
            <span className={`notes-save-state ${status}`}>
              {status === "saved" ? <Check size={14} /> : <Cloud size={14} />}
              {status === "loading" ? "Loading…" : status === "saving" ? "Saving…" : status === "error" ? "Not saved" : "Saved"}
            </span>
          </div>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write freely about ideas, questions, useful examples and what you want to apply…"
            aria-label="Session notes"
          />
          {error && <p className="notes-error">{error}</p>}
          <div className="note-prompts">
            {prompts.map((prompt) => <button key={prompt} onClick={() => addPrompt(prompt)}>{prompt}</button>)}
          </div>
        </section>
        <aside className="notes-side">
          <div className="journey-card notes-help-card"><Lightbulb size={22} /><h3>Write for yourself</h3><p>Short phrases are fine. Capture practical examples, questions and moments that changed your thinking.</p></div>
          <div className="journey-card notes-ai-card"><Sparkles size={22} /><h3>Use notes in your plan</h3><p>Your saved notes become useful context when you build personalised workplace actions.</p><Link href="/plan" className="journey-primary-button">Build my plan</Link></div>
        </aside>
      </div>
    </div>
  );
}
