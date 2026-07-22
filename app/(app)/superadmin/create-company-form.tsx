"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCompany } from "@/app/actions/companies";
import { Loader2, Plus, X } from "lucide-react";

export default function CreateCompanyForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await createCompany({ name, slug: slug || undefined });
      if (result.error) {
        setError(result.error);
        return;
      }
      setName("");
      setSlug("");
      setOpen(false);
      router.refresh();
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
