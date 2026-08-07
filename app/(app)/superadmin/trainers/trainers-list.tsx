"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Trash2, UserRound, X, Check } from "lucide-react";
import { deleteTrainer, updateTrainer } from "@/app/actions/trainers";
import { TrainerImageUploadField } from "@/components/admin/content/TrainerImageUploadField";
import type { Trainer } from "@/lib/types";

export default function TrainersList({ trainers }: { trainers: Trainer[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftImageUrl, setDraftImageUrl] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  function startEdit(trainer: Trainer) {
    setEditingId(trainer.id);
    setDraftName(trainer.name);
    setDraftImageUrl(trainer.imageUrl ?? "");
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  async function handleSave(id: string) {
    setError(null);
    setBusyId(id);
    try {
      const result = await updateTrainer(id, { name: draftName, imageUrl: draftImageUrl || null });
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditingId(null);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remove this trainer? Cohorts currently assigned to them will show no trainer.")) return;
    setError(null);
    setBusyId(id);
    try {
      const result = await deleteTrainer(id);
      if (result.error) setError(result.error);
      else router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="superadmin-library-list">
      {error && <p className="p-3 text-xs font-bold text-red-600 border-b-2 border-black">{error}</p>}
      <ul>
        {trainers.map((trainer) => {
          const editing = editingId === trainer.id;
          const busy = busyId === trainer.id;
          return (
            <li key={trainer.id}>
              {editing ? (
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="w-full px-3 py-1.5 border-2 border-black rounded-lg text-sm font-semibold outline-none"
                    placeholder="Trainer name"
                  />
                  <div className="flex items-center gap-3">
                    {draftImageUrl && <img src={draftImageUrl} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-black" />}
                    <TrainerImageUploadField onUploaded={setDraftImageUrl} disabled={busy} label="Replace photo" />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSave(trainer.id)}
                      disabled={busy || !draftName.trim()}
                      className="p-2 border-2 border-black rounded-lg hover:bg-slate-50 disabled:opacity-50"
                      aria-label="Save"
                      title="Save"
                    >
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    </button>
                    <button onClick={cancelEdit} disabled={busy} className="p-2 border-2 border-black rounded-lg hover:bg-slate-50 disabled:opacity-50" aria-label="Cancel" title="Cancel">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-full overflow-hidden border-2 border-black flex items-center justify-center bg-slate-100 shrink-0">
                      {trainer.imageUrl ? <img src={trainer.imageUrl} alt="" className="w-full h-full object-cover" /> : <UserRound size={18} className="text-slate-400" />}
                    </span>
                    <p className="font-bold text-slate-900">{trainer.name}</p>
                  </div>
                  <div className="flex gap-2 self-start sm:self-center">
                    <button
                      onClick={() => startEdit(trainer)}
                      disabled={busy}
                      className="p-2 border-2 border-black rounded-lg hover:bg-slate-50 disabled:opacity-50"
                      aria-label="Edit"
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(trainer.id)}
                      disabled={busy}
                      className="p-2 border-2 border-black rounded-lg hover:bg-red-50 text-red-600 disabled:opacity-50"
                      aria-label="Delete"
                      title="Delete"
                    >
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
