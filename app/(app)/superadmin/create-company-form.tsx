"use client";

import { useState } from "react";
import { createCompany } from "@/app/actions/companies";
import { Plus } from "lucide-react";

export default function CreateCompanyForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await createCompany({ name, slug: slug || undefined });
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    setName("");
    setSlug("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 bg-[#FFCE00] border-2 border-black px-5 py-2.5 rounded-xl font-black uppercase text-[11px] tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-0.5 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
      >
        <Plus size={16} /> New Company
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border-2 border-black rounded-xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Company name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="flex-1 px-4 py-2 border-2 border-black rounded-lg text-sm font-semibold outline-none focus:border-[#3699FC]"
        />
        <input
          type="text"
          placeholder="Slug (optional)"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="w-full sm:w-32 px-4 py-2 border-2 border-black rounded-lg text-sm font-semibold outline-none focus:border-[#3699FC]"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-[#3699FC] border-2 border-black text-white rounded-lg font-bold text-xs uppercase tracking-wider disabled:opacity-50"
          >
            {loading ? "…" : "Create"}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setError(null); }}
            className="px-4 py-2 bg-white border-2 border-black rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs font-bold text-red-600">{error}</p>}
    </form>
  );
}
