"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCompany } from "@/app/actions/companies";
import { uploadCompanyLogo } from "@/lib/company-logo-upload";
import { Building2, CalendarDays, Pencil, Check, ImagePlus, Loader2, Trash2, X } from "lucide-react";

type Company = { id: string; name: string; slug: string | null; logo_url: string | null; created_at: string };

export default function CompaniesList({ companies }: { companies: Company[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editLogoUrl, setEditLogoUrl] = useState<string | null>(null);
  const [editLogoFile, setEditLogoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(id: string) {
    setError(null);
    setLoading(true);
    try {
      const logoUrl = editLogoFile ? await uploadCompanyLogo(id, editLogoFile) : editLogoUrl;
      const result = await updateCompany(id, { name: editName, slug: editSlug || undefined, logoUrl });
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditingId(null);
      setEditLogoFile(null);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to update company");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(c: Company) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditSlug(c.slug ?? "");
    setEditLogoUrl(c.logo_url);
    setEditLogoFile(null);
    setError(null);
  }

  return (
    <ul className="superadmin-company-list">
      {companies.map((c) => (
        <li key={c.id}>
          {editingId === c.id ? (
            <>
              <div className="superadmin-company-edit-fields">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1"
                />
                <input
                  value={editSlug}
                  onChange={(e) => setEditSlug(e.target.value)}
                  placeholder="Slug"
                  className="w-full sm:w-36"
                />
                <div className="superadmin-company-logo-editor">
                  <span className="superadmin-company-logo">
                    {editLogoUrl ? <img src={editLogoUrl} alt="" /> : <Building2 size={18} />}
                  </span>
                  <label>
                    <ImagePlus size={15} />
                    <span>{editLogoFile?.name || (editLogoUrl ? "Replace logo" : "Upload logo")}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={(event) => setEditLogoFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  {(editLogoUrl || editLogoFile) && <button type="button" onClick={() => { setEditLogoUrl(null); setEditLogoFile(null); }}><Trash2 size={14} /> Remove</button>}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSave(c.id)}
                  disabled={loading}
                  className="superadmin-icon-action success"
                  aria-label="Save"
                >
                  {loading ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="superadmin-icon-action"
                  aria-label="Cancel"
                >
                  <X size={18} />
                </button>
              </div>
              {error && <p className="text-xs font-bold text-red-600 sm:col-span-2">{error}</p>}
            </>
          ) : (
            <>
              <div className="superadmin-company-identity"><span className="superadmin-company-logo">{c.logo_url ? <img src={c.logo_url} alt={`${c.name} logo`} /> : <Building2 size={17} />}</span><div><strong>{c.name}</strong><small>{c.slug ? `/${c.slug}` : "No workspace slug"}</small></div></div>
              <div className="superadmin-company-date"><CalendarDays size={14} /><span>Created {new Date(c.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
              <button
                onClick={() => startEdit(c)}
                className="superadmin-icon-action"
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
