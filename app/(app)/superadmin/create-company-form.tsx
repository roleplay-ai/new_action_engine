"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCompany } from "@/app/actions/companies";
import { uploadCompanyLogo } from "@/lib/company-logo-upload";
import { ImagePlus, Loader2, Plus, X } from "lucide-react";

export default function CreateCompanyForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [programPhasesJson, setProgramPhasesJson] = useState("");
  const [showProgramPhases, setShowProgramPhases] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const logoUrl = logoFile ? await uploadCompanyLogo(null, logoFile) : undefined;
      const result = await createCompany({ name, slug: slug || undefined, logoUrl, programPhasesJson: programPhasesJson || undefined });
      if (result.error) {
        setError(result.error);
        return;
      }
      setName("");
      setSlug("");
      setLogoFile(null);
      setProgramPhasesJson("");
      setShowProgramPhases(false);
      setOpen(false);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to create company");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="superadmin-primary-action"
      >
        <Plus size={16} /> New Company
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="superadmin-quick-form">
      <div className="superadmin-quick-form-title"><div><strong>New company</strong><small>Add an organisation to the workspace.</small></div><button type="button" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button></div>
      <div className="superadmin-quick-form-fields">
        <input
          type="text"
          placeholder="Company name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="flex-1"
        />
        <input
          type="text"
          placeholder="Slug (optional)"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="w-full sm:w-40"
        />
        <label className="superadmin-logo-upload">
          <ImagePlus size={16} />
          <span>{logoFile ? logoFile.name : "Upload company logo"}</span>
          <small>PNG, JPG, WebP or SVG · max 10 MB</small>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button type="button" className="superadmin-secondary-action" onClick={() => setShowProgramPhases((v) => !v)}>
          {showProgramPhases ? "Hide" : "Add"} program agenda (optional)
        </button>
        {showProgramPhases && (
          <label className="superadmin-program-phases-editor">
            <span>Program agenda (JSON, optional)</span>
            <small>Phases/days/session blocks for this company&apos;s Journey workspace agenda. Can be added or edited later from the company row below.</small>
            <textarea
              value={programPhasesJson}
              onChange={(e) => setProgramPhasesJson(e.target.value)}
              placeholder={'[\n  {\n    "id": "1",\n    "label": "Phase 1",\n    "window": "Month 1 · 12 to 13 Jan",\n    "title": "Module 1 · ...",\n    "focus": "...",\n    "summary": "...",\n    "days": [\n      {\n        "name": "Day 1 · ...",\n        "date": "Mon 12 Jan",\n        "takeaway": "...",\n        "blocks": [\n          { "time": "9.30-11.00", "name": "...", "description": "..." }\n        ]\n      }\n    ]\n  }\n]'}
              rows={8}
              spellCheck={false}
            />
          </label>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="superadmin-submit"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}{loading ? "Creating" : "Create"}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setError(null); }}
            className="superadmin-secondary-action"
          >
            Cancel
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs font-bold text-red-600">{error}</p>}
    </form>
  );
}
