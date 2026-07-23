"use client";

import React, { useEffect, useRef, useState } from "react";
import { HelpCircle, CheckCircle2, X } from "lucide-react";
import { getQuizForAttempt, submitQuizAttempt } from "@/app/actions/prepare-progress";
import type { PrepareContentItem } from "@/lib/types";

type QuizQuestion = { id: string; questionText: string; options: { id: string; optionText: string }[] };

export default function QuizCard({
  item,
  completed,
  lastScore,
  lastTotalQuestions,
  onComplete,
  autoOpen = false,
  modalOnly = false,
  onRequestClose,
}: {
  item: PrepareContentItem;
  completed: boolean;
  lastScore?: number | null;
  lastTotalQuestions?: number | null;
  onComplete: (id: string) => Promise<void>;
  autoOpen?: boolean;
  modalOnly?: boolean;
  onRequestClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoOpened = useRef(false);

  useEffect(() => {
    if (autoOpen && !autoOpened.current) {
      autoOpened.current = true;
      void handleOpen();
    }
  }, [autoOpen]);

  function handleClose() {
    setOpen(false);
    onRequestClose?.();
  }

  async function handleOpen() {
    setOpen(true);
    setResult(null);
    setError(null);
    setAnswers({});
    setLoading(true);
    const res = await getQuizForAttempt(item.id);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setQuestions(res.questions ?? []);
  }

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    const res = await submitQuizAttempt(item.id, answers);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setResult({ score: res.score ?? 0, total: res.totalQuestions ?? questions.length });
    await onComplete(item.id);
  }

  return (
    <div
      className={modalOnly ? "quiz-card--modal-only" : "card card--flat"}
      style={modalOnly ? undefined : { background: "rgba(255, 206, 0, 0.10)", border: "1px solid var(--color-border-yellow)", maxWidth: "none" }}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          style={{
            width: 36, height: 36, borderRadius: "50%", background: "var(--bright-amber)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <HelpCircle size={17} style={{ color: "var(--color-text-primary)" }} strokeWidth={2.5} />
        </div>
        {completed && (
          <span className="tag tag--featured flex items-center gap-1">
            <CheckCircle2 size={13} strokeWidth={2.5} /> Done
          </span>
        )}
      </div>
      <p className="text-xs font-black uppercase tracking-wider mb-1" style={{ color: "var(--color-text-accent)" }}>
        {item.badgeLabel || "Self-assessment"}
      </p>
      <h3 style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-bold)", color: "var(--color-text-primary)", marginBottom: 4 }}>
        {item.title}
      </h3>
      {item.description && <p className="text-sm mb-2" style={{ color: "var(--color-text-secondary)" }}>{item.description}</p>}
      {!item.description && item.questionCount != null && (
        <p className="text-sm mb-2" style={{ color: "var(--color-text-secondary)" }}>
          {item.questionCount} question{item.questionCount === 1 ? "" : "s"} to complete.
        </p>
      )}
      {completed && lastScore != null && lastTotalQuestions != null && (
        <p className="text-sm font-semibold mt-1 mb-2" style={{ color: "var(--color-text-secondary)" }}>
          Last score: {lastScore}/{lastTotalQuestions}
        </p>
      )}

      <button
        onClick={handleOpen}
        className="text-sm font-bold mt-2"
        style={{ color: "var(--color-text-primary)" }}
      >
        {completed ? "Retake assessment →" : "Begin assessment →"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[280] flex items-center justify-center p-4 sm:p-8"
          style={{ background: "rgba(34,29,35,0.65)", backdropFilter: "blur(12px)" }}
        >
          <div className="card card--wide animate-pop w-full overflow-y-auto no-scrollbar" style={{ maxHeight: "90vh" }}>
            <div className="flex justify-between items-start mb-6">
              <h3 className="card__title">{item.title}</h3>
              <button onClick={handleClose} className="btn btn--icon ml-4">
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            {loading && !result && <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</p>}
            {error && <p className="text-xs font-bold" style={{ color: "#ED4551" }}>{error}</p>}

            {!loading && !result && questions.length > 0 && (
              <div className="space-y-6">
                {questions.map((q, qi) => (
                  <div key={q.id}>
                    <p className="font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>
                      {qi + 1}. {q.questionText}
                    </p>
                    <div className="space-y-2">
                      {q.options.map((o) => (
                        <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="radio"
                            name={q.id}
                            checked={answers[q.id] === o.id}
                            onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                          />
                          {o.optionText}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <button
                  onClick={handleSubmit}
                  disabled={loading || Object.keys(answers).length < questions.length}
                  className="btn btn--accept btn--full"
                >
                  Submit
                </button>
              </div>
            )}

            {result && (
              <div className="text-center py-6">
                <p className="text-3xl font-bold mb-2" style={{ color: "var(--color-text-primary)" }}>
                  {result.score}/{result.total}
                </p>
                <p className="card__subtitle mb-4">Assessment complete.</p>
                <button onClick={handleClose} className="btn btn--primary btn--full">
                  Continue
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
