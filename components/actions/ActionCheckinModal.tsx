"use client";

import { createPortal } from "react-dom";
import { CheckCircle2, X } from "lucide-react";

/**
 * "How did this action go?" check-in shown after "I did it", on My Actions
 * and on the dashboard's action plan card.
 */
export default function ActionCheckinModal({
  open,
  reflection,
  busy,
  error,
  onReflectionChange,
  onClose,
  onComplete,
}: {
  open: boolean;
  reflection: string;
  busy: boolean;
  error: string | null;
  onReflectionChange: (value: string) => void;
  onClose: () => void;
  onComplete: () => void;
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="actions-checkin-overlay">
      <div className="actions-checkin-modal" role="dialog" aria-modal="true" aria-labelledby="actions-checkin-title">
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} /></button>
        <span className="participant-eyebrow">Action check-in</span>
        <h3 id="actions-checkin-title">How did this action go?</h3>
        <p>Add a short reflection. It helps you notice what worked and what to adjust.</p>
        <textarea value={reflection} onChange={(event) => onReflectionChange(event.target.value)} placeholder="What happened when you tried it?" />
        {error && <p className="actions-checkin-error" role="alert" style={{ color: "var(--color-danger, #ed4551)", fontSize: "var(--text-sm)" }}>{error}</p>}
        <div>
          <button type="button" className="journey-primary-button" disabled={busy} onClick={onComplete}>
            <CheckCircle2 size={16} strokeWidth={2.5} />{busy ? "Saving…" : "Complete action"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
