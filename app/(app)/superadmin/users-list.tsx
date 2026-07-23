"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, CheckSquare, Square, Loader2, Pencil, Trash2 } from "lucide-react";
import {
  updateUserBySuperadmin,
  deleteUserBySuperadmin,
} from "@/app/actions/superadmin";
import { sendWelcomeEmails, type SendEmailResult } from "@/app/actions/email-campaign";

type User = {
  id: string;
  email: string;
  full_name: string;
  company_id: string | null;
  role: string;
  company_name: string | null;
  persistent_login_key?: string | null;
  has_stored_credentials?: boolean;
};

type Company = { id: string; name: string };

export default function UsersList({
  users,
  companies,
  currentUserId,
}: {
  users: User[];
  companies: Company[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [editing, setEditing] = useState<User | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editRole, setEditRole] = useState<"user" | "admin">("user");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);

  // Email selection state
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [sendingEmails, setSendingEmails] = useState(false);
  const [emailResults, setEmailResults] = useState<SendEmailResult[] | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const selectableUsers = users.filter(
    (u) =>
      u.role !== "superadmin" &&
      !!u.persistent_login_key &&
      !!u.has_stored_credentials
  );
  const allSelected = selectableUsers.length > 0 && selectableUsers.every((u) => selectedUserIds.has(u.id));

  function toggleUser(userId: string) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(selectableUsers.map((u) => u.id)));
    }
  }

  async function handleSendEmails() {
    if (selectedUserIds.size === 0) return;
    setSendingEmails(true);
    setEmailResults(null);
    setEmailError(null);

    try {
      const result = await sendWelcomeEmails(Array.from(selectedUserIds));
      if (result.error) {
        setEmailError(result.error);
      } else {
        setEmailResults(result.results);
        setSelectedUserIds(new Set());
      }
    } finally {
      setSendingEmails(false);
    }
  }

  function openEdit(u: User) {
    setEditing(u);
    setEditFullName(u.full_name || "");
    setEditCompanyId(u.company_id || "");
    setEditRole(u.role === "admin" ? "admin" : "user");
    setEditError(null);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const result = await updateUserBySuperadmin(editing.id, {
        fullName: editFullName,
        companyId: editCompanyId || null,
        role: editRole,
      });
      if (result.error) {
        setEditError(result.error);
        return;
      }
      setEditing(null);
      router.refresh();
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(userId: string) {
    if (!window.confirm("Permanently delete this user? This cannot be undone.")) return;
    setActionError(null);
    setDeletingId(userId);
    try {
      const result = await deleteUserBySuperadmin(userId);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  const isSuperadminTarget = editing?.role === "superadmin";

  return (
    <div className="overflow-x-auto">
      {/* Email send toolbar */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-50 border-b-2 border-black">
        <button
          type="button"
          onClick={toggleAll}
          className="flex items-center gap-2 px-3 py-1.5 border-2 border-black rounded-lg text-xs font-bold uppercase hover:bg-white transition-colors"
        >
          {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
          {allSelected ? "Deselect all" : "Select all"}
        </button>

        <button
          type="button"
          onClick={handleSendEmails}
          disabled={selectedUserIds.size === 0 || sendingEmails}
          className="flex items-center gap-2 px-4 py-1.5 bg-[#3699FC] text-white border-2 border-black rounded-lg text-xs font-bold uppercase disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#2980e0] transition-colors"
        >
          {sendingEmails ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Mail size={16} />
          )}
          Send welcome email ({selectedUserIds.size})
        </button>

        {emailError && (
          <span className="text-xs font-bold text-red-600">{emailError}</span>
        )}
      </div>

      {actionError && (
        <div className="px-4 py-2 bg-red-50 border-b-2 border-red-200 text-xs font-bold text-red-700">
          {actionError}
        </div>
      )}

      {/* Email results */}
      {emailResults && emailResults.length > 0 && (
        <div className="p-4 bg-emerald-50 border-b-2 border-emerald-200">
          <p className="text-xs font-bold uppercase text-emerald-800 mb-2">
            Sent {emailResults.filter((r) => r.success).length} / {emailResults.length} emails
          </p>
          <div className="flex flex-wrap gap-2">
            {emailResults.map((r) => (
              <span
                key={r.userId}
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  r.success ? "bg-emerald-200 text-emerald-800" : "bg-red-200 text-red-800"
                }`}
                title={r.error || "Sent"}
              >
                {r.email} {r.success ? "✓" : "✗"}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setEmailResults(null)}
            className="mt-2 text-[10px] font-bold text-emerald-700 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-user-title"
        >
          <form
            onSubmit={handleSaveEdit}
            className="bg-white border-4 border-black rounded-2xl p-6 max-w-md w-full shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] space-y-4"
          >
            <h2 id="edit-user-title" className="text-sm font-black uppercase tracking-widest">
              Edit user
            </h2>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Email</label>
              <input
                type="email"
                value={editing.email}
                readOnly
                className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Full name</label>
              <input
                type="text"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                className="w-full px-4 py-2 border-2 border-black rounded-lg text-sm"
              />
            </div>

            {isSuperadminTarget ? (
              <p className="text-xs text-slate-600 border-l-4 border-amber-400 pl-3 py-1">
                This account is a superadmin. Only the display name can be changed here; company and role stay fixed.
              </p>
            ) : (
              <>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Company</label>
                  <select
                    value={editCompanyId}
                    onChange={(e) => setEditCompanyId(e.target.value)}
                    className="w-full px-4 py-2 border-2 border-black rounded-lg text-sm"
                  >
                    <option value="">— None —</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Role</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as "user" | "admin")}
                    className="w-full px-4 py-2 border-2 border-black rounded-lg text-sm"
                  >
                    <option value="user">User</option>
                    <option value="admin">Company admin</option>
                  </select>
                </div>
              </>
            )}

            {editError && <p className="text-xs font-bold text-red-600">{editError}</p>}

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={editSaving}
                className="flex-1 px-4 py-2 bg-[#3699FC] border-2 border-black text-white rounded-lg font-bold text-xs uppercase tracking-wider disabled:opacity-50"
              >
                {editSaving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 bg-white border-2 border-black rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-black bg-slate-50">
            <th className="w-10 p-4"></th>
            <th className="text-left p-4 font-black uppercase text-[10px] tracking-wider">User</th>
            <th className="text-left p-4 font-black uppercase text-[10px] tracking-wider">Company</th>
            <th className="text-left p-4 font-black uppercase text-[10px] tracking-wider">Role</th>
            <th className="text-left p-4 font-black uppercase text-[10px] tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const canDelete = u.role !== "superadmin" && u.id !== currentUserId;
            return (
              <tr key={u.id} className="border-b border-slate-200 hover:bg-slate-50">
                <td className="p-4">
                  {selectableUsers.some((item) => item.id === u.id) ? (
                    <button
                      type="button"
                      onClick={() => toggleUser(u.id)}
                      className="text-slate-600 hover:text-slate-900"
                    >
                      {selectedUserIds.has(u.id) ? (
                        <CheckSquare size={18} className="text-[#3699FC]" />
                      ) : (
                        <Square size={18} />
                      )}
                    </button>
                  ) : (
                    <span
                      className="text-slate-300"
                      title={
                        u.role === "superadmin"
                          ? "Welcome emails are not sent to superadmins"
                          : "Stored credentials or login key unavailable"
                      }
                    >
                      —
                    </span>
                  )}
                </td>
                <td className="p-4">
                  <p className="font-semibold text-slate-900">{u.email}</p>
                  {u.full_name && (
                    <p className="text-xs text-slate-500">{u.full_name}</p>
                  )}
                </td>
                <td className="p-4">
                  {u.company_name ? (
                    <span>{u.company_name}</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="p-4">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      u.role === "superadmin"
                        ? "bg-amber-100"
                        : u.role === "admin"
                          ? "bg-blue-100"
                          : "bg-slate-100"
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(u)}
                      disabled={deletingId !== null}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-[#3699FC] text-white rounded text-xs font-bold border border-black disabled:opacity-50 hover:bg-[#2980e0]"
                      title="Edit name, company, and role"
                    >
                      <Pencil size={14} />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(u.id)}
                      disabled={deletingId !== null || !canDelete}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-red-600 text-white rounded text-xs font-bold border border-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-700"
                      title={
                        !canDelete
                          ? u.id === currentUserId
                            ? "You cannot delete your own account"
                            : "Superadmin accounts cannot be deleted here"
                          : "Delete user permanently"
                      }
                    >
                      {deletingId === u.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      {deletingId === u.id ? "Deleting" : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
