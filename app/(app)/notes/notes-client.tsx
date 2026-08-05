"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Cloud, Loader2, Sparkles } from "lucide-react";
import { useEngine } from "@/lib/store";
import { getMySessionNotes, refineMySessionNotes, saveMySessionNotes } from "@/app/actions/session-notes";
import { usePageLoading } from "@/components/PageLoadingProvider";

const prompts = [
  "What skills do you want to build?",
  "Why do they matter to you?",
  "Where would you like to apply them?",
];

export default function NotesClient({
  embedded = false,
  onBodyChange,
  onSavePlan,
}: {
  embedded?: boolean;
  onBodyChange?: (body: string) => void;
  onSavePlan?: (body: string) => void | Promise<void>;
}) {
  const { cohort } = useEngine();
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"loading" | "saved" | "saving" | "error">("loading");
  const [error, setError] = useState("");
  const [initializing, setInitializing] = useState(true);
  const [savingPlan, setSavingPlan] = useState(false);
  const [refining, setRefining] = useState(false);
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

  const handleRefine = async () => {
    if (!body.trim()) {
      setError("Add some notes before refining with AI.");
      setStatus("error");
      return;
    }
    setRefining(true);
    setError("");
    const result = await refineMySessionNotes(body, cohort?.id);
    setRefining(false);
    if (result.error || !result.body) {
      setError(result.error ?? "Failed to refine notes");
      setStatus("error");
      return;
    }
    skipNextSave.current = true;
    setBody(result.body);
    onBodyChange?.(result.body);
    setStatus("saved");
  };

  const handleSavePlan = async () => {
    if (!body.trim()) {
      setError("Add your notes before saving your plan.");
      setStatus("error");
      return;
    }
    setSavingPlan(true);
    setStatus("saving");
    setError("");
    const result = await saveMySessionNotes(body, cohort?.id);
    if (result.error) {
      setError(result.error);
      setStatus("error");
      setSavingPlan(false);
      return;
    }
    setStatus("saved");
    onBodyChange?.(body);
    await onSavePlan?.(body);
    setSavingPlan(false);
  };

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const busy = refining || savingPlan;

  if (initializing) return embedded
    ? <section className="unified-plan-section"><div className="journey-card unified-plan-loading" /></section>
    : null;

  return (
    <section className={`journey-page notes-page${embedded ? " unified-plan-section" : ""}`} id={embedded ? "notes" : undefined}>
      {!embedded && <div className="participant-page-heading"><span className="participant-eyebrow">Private workspace</span><h1>My session notes</h1><p>Capture what matters to you. Your notes stay private and can guide your AI action plan.</p></div>}
      <div className="notes-layout">
        <section className="journey-card notes-editor-card">
          <div className="note-prompts" aria-label="Questions to guide your notes">
            {prompts.map((prompt, index) => (
              <button className={body.includes(prompt) ? "used" : ""} key={prompt} type="button" onClick={() => addPrompt(prompt)} disabled={busy}>
                <span>{index + 1}</span>{prompt}
              </button>
            ))}
          </div>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Tap a question above to add it here, then write in your own words."
            aria-label="Session notes"
            disabled={busy}
          />
          {error && <p className="notes-error">{error}</p>}
          <div className="notes-editor-hint">
            <span>{words} {words === 1 ? "word" : "words"} · Private to you</span>
          </div>
          <div className="notes-editor-actions">
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
            <button
              type="button"
              className="journey-secondary-button"
              disabled={busy || !body.trim()}
              onClick={handleRefine}
            >
              {refining ? <><Loader2 size={15} className="plan-order-spinner" /> Refining…</> : <><Sparkles size={15} /> Refine with AI</>}
            </button>
            <button
              type="button"
              className="journey-primary-button"
              disabled={busy || !body.trim()}
              onClick={handleSavePlan}
            >
              {savingPlan ? "Saving…" : "Save my plan"}
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
