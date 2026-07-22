"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUser } from "@/app/actions/superadmin";
import { Loader2, Plus, X } from "lucide-react";

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
    try {
      const result = await createUser({
        email,
        password,
        fullName,
        companyId: companyId || null,
        role,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setEmail("");
      setPassword("");
      setFullName("");
      setCompanyId("");
      setRole("user");
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
        <Plus size={16} /> Create User
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="superadmin-creation-form"
    >
      <div className="superadmin-creation-form-head"><div><h3>Create user</h3><p>Set up credentials, access, and company assignment.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close"><X size={17} /></button></div>
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
          className="superadmin-submit"
        >
          {loading && <Loader2 size={14} className="animate-spin" />}{loading ? "Creating" : "Create user"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="superadmin-secondary-action"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
