"use client";

import { useState } from "react";
import { Mail, CheckSquare, Square, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { sendAutoLoginEmails, type SendEmailResult } from "@/app/actions/email-campaign";

type User = {
  id: string;
  email: string;
  full_name: string;
  role: string;
};

export default function AutoLoginEmailPanel({ users }: { users: User[] }) {
  const [expanded, setExpanded] = useState(false);

  const selectableUsers = users.filter((u) => u.role !== "superadmin");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  const [sendingEmails, setSendingEmails] = useState(false);
  const [emailResults, setEmailResults] = useState<SendEmailResult[] | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const allSelected =
    selectableUsers.length > 0 &&
    selectableUsers.every((u) => selectedUserIds.has(u.id));

  function toggleUser(userId: string) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  }

  function toggleAll() {
    setSelectedUserIds(
      allSelected ? new Set() : new Set(selectableUsers.map((u) => u.id))
    );
  }

  async function handleSendEmails() {
    if (selectedUserIds.size === 0) return;
    setSendingEmails(true);
    setEmailResults(null);
    setEmailError(null);

    const result = await sendAutoLoginEmails(Array.from(selectedUserIds));
    if (result.error) {
      setEmailError(result.error);
    } else {
      setEmailResults(result.results);
      setSelectedUserIds(new Set());
    }
    setSendingEmails(false);
  }

  return (
    <div className="border-4 border-black rounded-2xl overflow-hidden bg-blue-50 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left font-black uppercase tracking-tight hover:bg-blue-100 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Mail size={18} />
          Auto-login emails
        </span>
        {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {expanded && (
        <div className="p-4 pt-0 border-t-2 border-black space-y-4">
          <p className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">
            Send the login email (auto-login link) to selected users.
          </p>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 p-3 bg-white border-2 border-black rounded-xl">
            <button
              type="button"
              onClick={toggleAll}
              className="flex items-center gap-2 px-3 py-1.5 border-2 border-black rounded-lg text-xs font-bold uppercase hover:bg-slate-50 transition-colors"
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
              Send login email ({selectedUserIds.size})
            </button>

            {emailError && (
              <span className="text-xs font-bold text-red-600">{emailError}</span>
            )}
          </div>

          {/* Results */}
          {emailResults && emailResults.length > 0 && (
            <div className="p-3 bg-emerald-50 border-2 border-emerald-200 rounded-xl">
              <p className="text-xs font-bold uppercase text-emerald-800 mb-2">
                Sent {emailResults.filter((r) => r.success).length} /{" "}
                {emailResults.length} emails
              </p>
              <div className="flex flex-wrap gap-2">
                {emailResults.map((r) => (
                  <span
                    key={r.userId}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      r.success
                        ? "bg-emerald-200 text-emerald-800"
                        : "bg-red-200 text-red-800"
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

          {/* User list */}
          <div className="max-h-56 overflow-y-auto border-2 border-black rounded-xl bg-white">
            {selectableUsers.length === 0 ? (
              <p className="p-3 text-xs text-slate-400 italic">No users found.</p>
            ) : (
              selectableUsers.map((u) => (
                <label
                  key={u.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-b-0"
                >
                  <input
                    type="checkbox"
                    checked={selectedUserIds.has(u.id)}
                    onChange={() => toggleUser(u.id)}
                    className="accent-black"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="text-xs font-semibold truncate block">
                      {u.email}
                    </span>
                    {u.full_name && (
                      <span className="text-[10px] text-slate-400">
                        {u.full_name}
                      </span>
                    )}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

