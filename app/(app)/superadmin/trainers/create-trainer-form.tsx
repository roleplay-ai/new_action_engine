"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { createTrainer } from "@/app/actions/trainers";
import { TrainerImageUploadField } from "@/components/admin/content/TrainerImageUploadField";

export default function CreateTrainerForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setImageUrl("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await createTrainer({ name, imageUrl: imageUrl || undefined });
      if (result.error) {
        setError(result.error);
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="superadmin-primary-action">
        <Plus size={16} /> New trainer
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="superadmin-creation-form superadmin-content-form">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-wider text-slate-400">New trainer</span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="p-1.5 border-2 border-black rounded-lg hover:bg-slate-50"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <input
        type="text"
        placeholder="Trainer name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="w-full px-4 py-2 border-2 border-black rounded-lg text-sm font-semibold outline-none focus:border-[#3699FC]"
      />

      <TrainerImageUploadField onUploaded={setImageUrl} disabled={loading} />
      {imageUrl && (
        <div className="flex items-center gap-2">
          <img src={imageUrl} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-black" />
          <p className="text-xs font-bold text-emerald-600">Photo uploaded ✓</p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="px-4 py-2 bg-[#3699FC] border-2 border-black text-white rounded-lg font-bold text-xs uppercase tracking-wider disabled:opacity-50"
        >
          {loading ? "…" : "Create"}
        </button>
      </div>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
    </form>
  );
}
