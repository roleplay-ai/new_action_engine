"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUser } from "@/app/actions/superadmin";
import { Plus } from "lucide-react";

type Company = { id: string; name: string };

export default function CreateUserForm({ companies }: { companies: Company[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await createUser({
      email,
      password,
      fullName,
      companyId: companyId || null,
      role,
    });
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    router.refresh();
    setEmail("");
    setPassword("");
    setFullName("");
    setCompanyId("");
    setRole("user");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 bg-[#FFCE00] border-2 border-black px-5 py-2.5 rounded-xl font-black uppercase text-[11px] tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-0.5 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
      >
        <Plus size={16} /> Create User
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border-2 border-black rounded-xl p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-4 max-w-md"
    >
      <h3 className="text-xs font-black uppercase tracking-widest text-slate-600">
        Create user (credentials)
      </h3>
      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-4 py-2 border-2 border-black rounded-lg text-sm"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Password</label>
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          placeholder="Generated or chosen password"
          className="w-full px-4 py-2 border-2 border-black rounded-lg text-sm"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Full name</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full px-4 py-2 border-2 border-black rounded-lg text-sm"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Company</label>
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          className="w-full px-4 py-2 border-2 border-black rounded-lg text-sm"
        >
          <option value="">— None —</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "user" | "admin")}
          className="w-full px-4 py-2 border-2 border-black rounded-lg text-sm"
        >
          <option value="user">User</option>
          <option value="admin">Company Admin</option>
        </select>
      </div>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-[#3699FC] border-2 border-black text-white rounded-lg font-bold text-xs uppercase tracking-wider disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="px-4 py-2 bg-white border-2 border-black rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
