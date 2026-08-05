"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CheckSquare2, Cloud, NotebookPen, Sparkles } from "lucide-react";
import { useEngine } from "@/lib/store";
import { getMySessionNotes, saveMySessionNotes } from "@/app/actions/session-notes";
import { usePageLoading } from "@/components/PageLoadingProvider";

const prompts = [
  "What skills do you want to build?",
  "Why do they matter to you?",
  "Where would you like to apply them?",
];

export default function NotesClient({ embedded = false, onBodyChange, onGeneratePlan }: { embedded?: boolean; onBodyChange?: (body: string) => void; onGeneratePlan?: (body: string) => void | Promise<void> }) {
  const { cohort } = useEngine();
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"loading" | "saved" | "saving" | "error">("loading");
  const [error, setError] = useState("");
  const [initializing, setInitializing] = useState(true);
  const [continuing, setContinuing] = useState(false);
  const loaded = useRef(false);
  const skipNextSave = useRef(false);

  usePageLoading(embedded ? false : initializing);

  useEffect(() => {
    let cancelled = false;
    loaded.current = false;
    setInitializing(true);
    setStatus("loading");
    getMySessionNotes(cohort?.id).then((result) => {
      if (cancelled) return;
      skipNextSave.current = true;
      setBody(result.body);
      setError(result.error ?? "");
      setStatus(result.error ? "error" : "saved");
      loaded.current = true;
      setInitializing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [cohort?.id]);

  useEffect(() => {
    if (!loaded.current) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    setStatus("saving");
    const timer = window.setTimeout(async () => {
      const result = await saveMySessionNotes(body, cohort?.id);
      setError(result.error ?? "");
      setStatus(result.error ? "error" : "saved");
    }, 700);
    return () => window.clearTimeout(timer);
  }, [body, cohort?.id]);

  useEffect(() => {
    if (loaded.current) onBodyChange?.(body);
  }, [body, onBodyChange]);

  const addPrompt = useCallback((prompt: string) => {
    setBody((current) => `${current}${current.trim() ? "\n\n" : ""}${prompt} `);
  }, []);

  const handleGeneratePlan = async () => {
    if (!body.trim()) {
      setError("Add your notes before generating a plan.");
      setStatus("error");
      return;
    }
    setContinuing(true);
    setStatus("saving");
    setError("");
    const result = await saveMySessionNotes(body, cohort?.id);
    if (result.error) {
      setError(result.error);
      setStatus("error");
      setContinuing(false);
      return;
    }
    setStatus("saved");
    onBodyChange?.(body);
    await onGeneratePlan?.(body);
    setContinuing(false);
  };

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  if (initializing) return embedded
    ? <section className="unified-plan-section"><div className="unified-plan-section-heading"><span className="participant-eyebrow">Step 1 · Reflect</span><h2>Your private notes</h2><p>Loading your saved notes…</p></div><div className="journey-card unified-plan-loading" /></section>
    : null;

  return (
    <section className={`journey-page notes-page${embedded ? " unified-plan-section" : ""}`} id={embedded ? "notes" : undefined}>
      {embedded ? <div className="unified-plan-section-heading"><span className="participant-eyebrow">Step 1 · Reflect</span><h2>Your private notes</h2><p>Capture what matters. These notes autosave and guide the actions generated below.</p></div> : <div className="participant-page-heading"><span className="participant-eyebrow">Private workspace</span><h1>My session notes</h1><p>Capture what matters to you. Your notes stay private and can guide your AI action plan.</p></div>}
      <div className="notes-layout">
        <section className="journey-card notes-editor-card">
          <div className="notes-editor-head">
            <div>
              <strong>{cohort?.name ?? "Learning session"}</strong>
              <span>
                {words} {words === 1 ? "word" : "words"}
              </span>
            </div>
            <span className={`notes-save-state ${status}`}>
              {status === "saved" ? <Check size={14} /> : <Cloud size={14} />}
              {status === "loading"
                ? "Loading…"
                : status === "saving"
                  ? "Saving…"
                  : status === "error"
                    ? "Not saved"
                    : "Saved"}
            </span>
          </div>
          <div className="note-prompts" aria-label="Questions to guide your notes">
            {prompts.map((prompt, index) => (
              <button className={body.includes(prompt) ? "used" : ""} key={prompt} type="button" onClick={() => addPrompt(prompt)}>
                <span>{index + 1}</span>{prompt}
              </button>
            ))}
          </div>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Tap a question above to add it here, then write in your own words."
            aria-label="Session notes"
          />
          {error && <p className="notes-error">{error}</p>}
          <div className="notes-editor-hint"><span>{words} {words === 1 ? "word" : "words"}</span><span>Private to you</span></div>
        </section>
        <aside className="journey-card notes-plan-visual" aria-label="How your notes become actions">
          <div><NotebookPen size={23} /><strong>Your words</strong></div>
          <ArrowRight className="notes-plan-arrow" size={18} />
          <div><Sparkles size={23} /><strong>AI shapes</strong></div>
          <ArrowRight className="notes-plan-arrow" size={18} />
          <div><CheckSquare2 size={23} /><strong>Your actions</strong></div>
          {embedded && <button type="button" className="journey-primary-button" disabled={continuing || !body.trim()} onClick={handleGeneratePlan}>{continuing ? "Preparing plan…" : "Generate Plan"}</button>}
          {!embedded && <Link href="/plan" className="journey-primary-button">Continue to actions</Link>}
        </aside>
      </div>
    </section>
  );
}
