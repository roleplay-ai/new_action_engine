"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, FileText, X } from "lucide-react";
import type { Facilitator } from "@/lib/types";

/** Same PDF popup shape as the Prepare library's pre-read PDFs
 * (components/prepare/PdfReader.tsx + journey-resource-modal--pdf), minus
 * the "mark as read" progress tracking facilitators don't have. */
function FacilitatorPdfModal({ facilitator, onClose }: { facilitator: Facilitator; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  if (typeof document === "undefined" || !facilitator.pdfUrl) return null;

  return createPortal(
    <div className="journey-resource-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="journey-resource-modal journey-resource-modal--pdf" role="dialog" aria-modal="true" aria-labelledby="facilitator-pdf-title">
        <header className="journey-resource-modal-head">
          <div><span>PDF</span><strong id="facilitator-pdf-title">{facilitator.name}</strong></div>
          <button className="journey-modal-close" onClick={onClose} aria-label="Close PDF"><X size={18} /></button>
        </header>
        <div className="journey-resource-modal-body">
          <div className="journey-pdf-reader">
            <div className="journey-pdf-reader-frame">
              <iframe
                src={`${facilitator.pdfUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH&zoom=page-width`}
                title={`${facilitator.name} PDF`}
              />
            </div>
            <footer className="journey-pdf-reader-bar">
              <p>{facilitator.designation}</p>
              <div className="journey-pdf-reader-actions">
                <a href={facilitator.pdfUrl} target="_blank" rel="noopener noreferrer">
                  Open in new tab <ExternalLink size={14} strokeWidth={2.5} />
                </a>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Read-only list of facilitators running this cohort — name, designation
 * and an optional "View PDF" button that opens the PDF in the same popup
 * shape as a pre-read resource. Shown in the side rail, directly below the
 * commitment buddy card on Base Camp. */
export default function FacilitatorsCard({
  facilitators,
  variant = "default",
}: {
  facilitators: Facilitator[];
  variant?: "default" | "rcpl";
}) {
  const [openFacilitator, setOpenFacilitator] = useState<Facilitator | null>(null);

  if (facilitators.length === 0) return null;

  if (variant === "rcpl") {
    return (
      <section className="rcpl-card rcpl-facilitators-card">
        <header><h3>Facilitators</h3></header>
        <div>
          {facilitators.map((facilitator) => (
            <div className="rcpl-facilitator-row" key={facilitator.id}>
              <span><strong>{facilitator.name}</strong><small>{facilitator.designation}</small></span>
              {facilitator.pdfUrl && (
                <button type="button" onClick={() => setOpenFacilitator(facilitator)} className="rcpl-facilitator-pdf-btn">
                  <FileText size={13} /> View PDF
                </button>
              )}
            </div>
          ))}
        </div>
        {openFacilitator && <FacilitatorPdfModal facilitator={openFacilitator} onClose={() => setOpenFacilitator(null)} />}
      </section>
    );
  }

  return (
    <article className="journey-module-card journey-v2-cohort-card journey-facilitators-card">
      <span className="journey-v2-card-kicker">Running this batch</span>
      <h3>Facilitators</h3>
      <ul className="journey-facilitators-list">
        {facilitators.map((facilitator) => (
          <li key={facilitator.id} className="journey-facilitator-row">
            <div className="journey-facilitator-copy">
              <strong>{facilitator.name}</strong>
              <small>{facilitator.designation}</small>
            </div>
            {facilitator.pdfUrl && (
              <button type="button" onClick={() => setOpenFacilitator(facilitator)} className="journey-facilitator-pdf-link">
                <FileText size={14} /> View PDF
              </button>
            )}
          </li>
        ))}
      </ul>
      {openFacilitator && <FacilitatorPdfModal facilitator={openFacilitator} onClose={() => setOpenFacilitator(null)} />}
    </article>
  );
}
