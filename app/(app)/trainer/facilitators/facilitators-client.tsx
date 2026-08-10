"use client";

import { FormEvent, useState } from "react";
import { FileText, Loader2, Plus, Trash2, UserRound } from "lucide-react";
import { createFacilitator, deleteFacilitator } from "@/app/actions/facilitators";
import { FacilitatorPdfUploadField } from "@/components/admin/content/FacilitatorPdfUploadField";
import type { Facilitator } from "@/lib/types";

export default function FacilitatorsClient({ cohortId, initialFacilitators }: { cohortId: string; initialFacilitators: Facilitator[] }) {
  const [facilitators, setFacilitators] = useState(initialFacilitators);
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfName, setPdfName] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !designation.trim() || saving) return;
    setSaving(true);
    setError(null);
    const result = await createFacilitator(cohortId, { name, designation, pdfUrl: pdfUrl || null, pdfName: pdfName || null });
    if (result.error) {
      setError(result.error);
    } else if (result.id) {
      setFacilitators((current) => [...current, { id: result.id!, cohortId, name: name.trim(), designation: designation.trim(), pdfUrl: pdfUrl || null, pdfName: pdfName || null }]);
      setName("");
      setDesignation("");
      setPdfUrl("");
      setPdfName("");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    setError(null);
    const result = await deleteFacilitator(cohortId, id);
    if (result.error) setError(result.error);
    else setFacilitators((current) => current.filter((facilitator) => facilitator.id !== id));
    setBusyId(null);
  }

  return (
    <div className="trainer-facilitators">
      <form className="trainer-facilitator-form" onSubmit={handleSubmit}>
        <div className="trainer-facilitator-form-fields">
          <label>
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Facilitator name" disabled={saving} />
          </label>
          <label>
            <span>Designation</span>
            <input value={designation} onChange={(event) => setDesignation(event.target.value)} placeholder="e.g. Co-facilitator" disabled={saving} />
          </label>
        </div>
        <FacilitatorPdfUploadField
          cohortId={cohortId}
          onUploaded={(url, name_) => {
            setPdfUrl(url);
            setPdfName(name_);
          }}
          disabled={saving}
          label={pdfName || "Upload PDF (optional)"}
        />
        <button type="submit" disabled={saving || !name.trim() || !designation.trim()}>
          {saving ? <Loader2 size={15} className="trainer-spin" /> : <Plus size={15} />}
          Add facilitator
        </button>
        {error && <p className="trainer-notice-error">{error}</p>}
      </form>

      {facilitators.length === 0 ? (
        <div className="trainer-empty">
          <UserRound size={24} />
          <strong>No facilitators added</strong>
          <p>Add anyone co-facilitating this batch — participants will see their name, designation and PDF.</p>
        </div>
      ) : (
        <ul className="trainer-facilitator-list">
          {facilitators.map((facilitator) => (
            <li key={facilitator.id} className="trainer-facilitator-row">
              <span className="trainer-facilitator-avatar"><UserRound size={16} /></span>
              <div className="trainer-facilitator-copy">
                <strong>{facilitator.name}</strong>
                <small>{facilitator.designation}</small>
              </div>
              {facilitator.pdfUrl && (
                <a href={facilitator.pdfUrl} target="_blank" rel="noreferrer" className="trainer-facilitator-pdf-link">
                  <FileText size={14} /> View PDF
                </a>
              )}
              <button type="button" onClick={() => void handleDelete(facilitator.id)} disabled={busyId === facilitator.id} aria-label={`Remove ${facilitator.name}`} title="Remove">
                {busyId === facilitator.id ? <Loader2 size={14} className="trainer-spin" /> : <Trash2 size={14} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
