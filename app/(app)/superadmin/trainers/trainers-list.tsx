"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, Loader2, Pencil, Trash2, UserRound, X } from "lucide-react";
import { createTrainerLogin, deleteTrainer, updateTrainer } from "@/app/actions/trainers";
import { TrainerImageUploadField } from "@/components/admin/content/TrainerImageUploadField";
import type { Trainer } from "@/lib/types";

type TrainerRow = Trainer & { loginEmail: string | null; cohortCount: number };

function randomPassword() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export default function TrainersList({ trainers }: { trainers: TrainerRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftImageUrl, setDraftImageUrl] = useState<string>("");
  const [loginFormId, setLoginFormId] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState(randomPassword());
  const [createdCredentials, setCreatedCredentials] = useState<{ trainerId: string; email: string; password: string } | null>(null);
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
    if (!window.confirm("Remove this trainer? Batches currently assigned to them will show no trainer, and their login (if any) stops working.")) return;
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

  function startLogin(trainer: TrainerRow) {
    setLoginFormId(trainer.id);
    setLoginEmail("");
    setLoginPassword(randomPassword());
    setError(null);
    setCreatedCredentials(null);
  }

  async function handleCreateLogin(trainer: TrainerRow) {
    if (!loginEmail.trim() || loginPassword.length < 8) return;
    setError(null);
    setBusyId(trainer.id);
    try {
      const result = await createTrainerLogin({ trainerId: trainer.id, email: loginEmail, password: loginPassword });
      if (result.error) {
        setError(result.error);
        return;
      }
      setCreatedCredentials({ trainerId: trainer.id, email: loginEmail.trim().toLowerCase(), password: loginPassword });
      setLoginFormId(null);
      router.refresh();
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
          const showingLoginForm = loginFormId === trainer.id;
          const justCreated = createdCredentials?.trainerId === trainer.id;
          return (
            <li key={trainer.id} className="flex-col items-stretch gap-2">
              <div className="flex items-center gap-3 w-full">
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
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="w-10 h-10 rounded-full overflow-hidden border-2 border-black flex items-center justify-center bg-slate-100 shrink-0">
                        {trainer.imageUrl ? <img src={trainer.imageUrl} alt="" className="w-full h-full object-cover" /> : <UserRound size={18} className="text-slate-400" />}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate">{trainer.name}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {trainer.cohortCount} {trainer.cohortCount === 1 ? "batch" : "batches"}
                          {trainer.loginEmail ? ` · Login: ${trainer.loginEmail}` : " · No login yet"}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 self-start sm:self-center shrink-0">
                      {!trainer.loginEmail && (
                        <button
                          onClick={() => startLogin(trainer)}
                          disabled={busy}
                          className="p-2 border-2 border-black rounded-lg hover:bg-slate-50 disabled:opacity-50"
                          aria-label="Create login"
                          title="Create login"
                        >
                          <KeyRound size={16} />
                        </button>
                      )}
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
                        {busy && !showingLoginForm ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {showingLoginForm && (
                <div className="w-full flex flex-wrap items-center gap-2 bg-slate-50 border-2 border-black rounded-lg p-3">
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="trainer@company.com"
                    className="flex-1 min-w-[180px] px-3 py-1.5 border-2 border-black rounded-lg text-sm font-semibold outline-none"
                  />
                  <input
                    type="text"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="flex-1 min-w-[160px] px-3 py-1.5 border-2 border-black rounded-lg text-sm font-mono outline-none"
                  />
                  <button
                    onClick={() => handleCreateLogin(trainer)}
                    disabled={busy || !loginEmail.trim() || loginPassword.length < 8}
                    className="px-3 py-1.5 border-2 border-black rounded-lg text-sm font-bold bg-black text-white disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin inline" /> : "Create"}
                  </button>
                  <button onClick={() => setLoginFormId(null)} disabled={busy} className="px-3 py-1.5 border-2 border-black rounded-lg text-sm font-semibold">
                    Cancel
                  </button>
                </div>
              )}

              {justCreated && createdCredentials && (
                <div className="w-full bg-amber-50 border-2 border-black rounded-lg p-3 text-xs">
                  <p className="font-bold mb-1">Login created — share these once, they won&apos;t be shown again here:</p>
                  <p>Email: <strong>{createdCredentials.email}</strong></p>
                  <p>Password: <strong className="font-mono">{createdCredentials.password}</strong></p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
