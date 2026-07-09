"use client";

import { useState } from "react";
import { updateCompany } from "@/app/actions/companies";
import { Pencil, Check, X } from "lucide-react";

type Company = { id: string; name: string; slug: string | null; created_at: string };

export default function CompaniesList({ companies }: { companies: Company[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(id: string) {
    setError(null);
    setLoading(true);
    const { error } = await updateCompany(id, { name: editName, slug: editSlug || undefined });
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    setEditingId(null);
  }

  function startEdit(c: Company) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditSlug(c.slug ?? "");
    setError(null);
  }

  return (
    <ul className="divide-y-2 divide-black">
      {companies.map((c) => (
        <li key={c.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {editingId === c.id ? (
            <>
              <div className="flex-1 flex flex-col sm:flex-row gap-2">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 px-3 py-2 border-2 border-black rounded-lg text-sm font-semibold"
                />
                <input
                  value={editSlug}
                  onChange={(e) => setEditSlug(e.target.value)}
                  placeholder="Slug"
                  className="w-full sm:w-28 px-3 py-2 border-2 border-black rounded-lg text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSave(c.id)}
                  disabled={loading}
                  className="p-2 bg-emerald-500 border-2 border-black rounded-lg text-white hover:bg-emerald-600 disabled:opacity-50"
                  aria-label="Save"
                >
                  <Check size={18} />
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="p-2 bg-slate-200 border-2 border-black rounded-lg hover:bg-slate-300"
                  aria-label="Cancel"
                >
                  <X size={18} />
                </button>
              </div>
              {error && <p className="text-xs font-bold text-red-600 sm:col-span-2">{error}</p>}
            </>
          ) : (
            <>
              <div>
                <p className="font-bold text-slate-900">{c.name}</p>
                {c.slug && <p className="text-xs text-slate-500">{c.slug}</p>}
              </div>
              <button
                onClick={() => startEdit(c)}
                className="p-2 border-2 border-black rounded-lg hover:bg-slate-50 self-start"
                aria-label="Edit"
              >
                <Pencil size={16} />
              </button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
