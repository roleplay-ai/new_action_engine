"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Mail, RefreshCw, Send, AlertCircle } from "lucide-react";
import {
  listUsersForCredentialEmail,
  sendLoginCredentialsEmails,
  type CredentialEmailUserRow,
} from "@/app/actions/admin-credential-email";

interface EmailManagementViewProps {
  companyId: string | null;
  role: string;
}

export function EmailManagementView({ companyId, role }: EmailManagementViewProps) {
  const [rows, setRows] = useState<CredentialEmailUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" } | null>(
    null
  );
  const [lastResults, setLastResults] = useState<
    { userId: string; email: string; success: boolean; error?: string }[] | null
  >(null);

  const showStatus = (text: string, type: "success" | "error") => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 5000);
  };

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { users, error } = await listUsersForCredentialEmail(companyId);
    setLoading(false);
    if (error) {
      showStatus(error, "error");
      setRows([]);
    } else {
      setRows(users ?? []);
      setSelected(new Set());
      setLastResults(null);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const credentialedUsers = useMemo(
    () => rows.filter((u) => u.hasStoredCredentials),
    [rows]
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllCredentialed = () => {
    setSelected(new Set(credentialedUsers.map((u) => u.id)));
  };

  const clearSelection = () => setSelected(new Set());

  const handleSend = async () => {
    if (!companyId || selected.size === 0) return;
    setSending(true);
    setLastResults(null);
    const { results, error } = await sendLoginCredentialsEmails(companyId, Array.from(selected));
    setSending(false);
    if (error) {
      showStatus(error, "error");
      return;
    }
    setLastResults(results ?? []);
    const ok = (results ?? []).filter((r) => r.success).length;
    const fail = (results ?? []).length - ok;
    showStatus(
      fail > 0
        ? `Sent ${ok} email(s), ${fail} failed — see details below.`
        : `Sent ${ok} credential email(s).`,
      fail > 0 ? "error" : "success"
    );
  };

  const canManage = role === "admin" || role === "superadmin";

  if (!companyId) {
    return (
      <div
        className="rounded-2xl p-8 text-center text-sm font-medium"
        style={{
          background: "var(--color-bg-base)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-muted)",
        }}
      >
        Select a company to manage credential emails.
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">
      <div
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <div className="space-y-1">
          <h2
            className="text-2xl font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Email management
          </h2>
          <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Send the credential with login email, password, and links to selected
            users.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {statusMsg && (
            <span
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={
                statusMsg.type === "success"
                  ? {
                    background: "rgba(35,206,107,0.1)",
                    color: "var(--emerald, #23ce6b)",
                    border: "1px solid rgba(35,206,107,0.25)",
                  }
                  : {
                    background: "rgba(237,69,81,0.08)",
                    color: "#ED4551",
                    border: "1px solid rgba(237,69,81,0.25)",
                  }
              }
            >
              {statusMsg.text}
            </span>
          )}
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="btn btn--decline btn--sm flex items-center gap-2"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          {canManage && (
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || selected.size === 0}
              className="btn btn--primary flex items-center gap-2"
            >
              {sending ? (
                <RefreshCw size={15} className="animate-spin" />
              ) : (
                <Send size={15} strokeWidth={2.5} />
              )}
              Send to selected ({selected.size})
            </button>
          )}
        </div>
      </div>

      {/* <div
        className="rounded-xl p-4 flex gap-3 items-start"
        style={{
          background: "rgba(54,153,252,0.08)",
          border: "1px solid rgba(54,153,252,0.2)",
        }}
      >
        <AlertCircle
          size={18}
          className="flex-shrink-0 mt-0.5"
          style={{ color: "var(--dodger-blue)" }}
        />
        <div className="text-xs font-medium space-y-1" style={{ color: "var(--color-text-secondary)" }}>
          <p>
            Template data includes the same fields as other campaign emails, plus{" "}
            <code className="text-[10px] px-1 py-0.5 rounded bg-black/10">login_email</code>,{" "}
            <code className="text-[10px] px-1 py-0.5 rounded bg-black/10">temporary_password</code>, and{" "}
            <code className="text-[10px] px-1 py-0.5 rounded bg-black/10">app_login_url</code>{" "}
            (password login page). Stored credentials are kept in the database after sending.
          </p>
        </div>
      </div> */}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={selectAllCredentialed}
          className="btn btn--decline btn--sm"
          disabled={!canManage || credentialedUsers.length === 0}
        >
          Select all with stored credentials
        </button>
        <button type="button" onClick={clearSelection} className="btn btn--decline btn--sm">
          Clear selection
        </button>
      </div>

      <div
        className="rounded-2xl overflow-hidden"
        style={{
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{
            background: "var(--color-bg-dark)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="flex items-center gap-2">
            <Mail size={15} strokeWidth={2} style={{ color: "var(--bright-amber)" }} />
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "rgba(255,255,255,0.7)" }}
            >
              Company users
            </span>
          </div>
          <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>
            {credentialedUsers.length} with stored credentials
          </span>
        </div>

        {loading ? (
          <div
            className="py-16 text-center text-sm font-medium"
            style={{
              background: "var(--color-bg-base)",
              color: "var(--color-text-muted)",
            }}
          >
            <RefreshCw size={20} className="animate-spin mx-auto mb-3" />
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
            No users in this company.
          </div>
        ) : (
          <div className="overflow-x-auto" style={{ background: "var(--color-bg-base)" }}>
            <table className="w-full text-left min-w-[520px]">
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--color-border)",
                    background: "var(--color-bg-muted)",
                  }}
                >
                  <th className="px-4 py-3 w-10" />
                  <th className="px-4 py-3 text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>
                    Name
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>
                    Email
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>
                    Credentials on file
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr
                    key={u.id}
                    style={{ borderBottom: "1px solid var(--color-border)" }}
                    className="transition-colors hover:bg-[var(--color-bg-muted)]"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="rounded border-slate-400"
                        checked={selected.has(u.id)}
                        disabled={!canManage || !u.hasStoredCredentials}
                        onChange={() => toggle(u.id)}
                        title={
                          u.hasStoredCredentials
                            ? "Include in send"
                            : "No stored password — create user via admin or update flow that saves credentials"
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      {u.full_name || "—"}
                    </td>
                    <td
                      className="px-4 py-3 text-xs font-medium truncate max-w-[200px]"
                      style={{ color: "var(--color-text-secondary)" }}
                      title={u.email}
                    >
                      {u.email || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg"
                        style={
                          u.hasStoredCredentials
                            ? { background: "rgba(35,206,107,0.12)", color: "var(--emerald, #23ce6b)" }
                            : { background: "rgba(255,255,255,0.06)", color: "var(--color-text-muted)" }
                        }
                      >
                        {u.hasStoredCredentials ? "Yes" : "No"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {lastResults && lastResults.length > 0 && (
        <div
          className="rounded-2xl p-5 space-y-3"
          style={{
            background: "var(--color-bg-base)",
            border: "1px solid var(--color-border)",
          }}
        >
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
            Last send results
          </p>
          <ul className="space-y-2 text-xs">
            {lastResults.map((r) => (
              <li
                key={r.userId}
                className="flex justify-between gap-4"
                style={{ color: r.success ? "var(--emerald, #23ce6b)" : "#ED4551" }}
              >
                <span className="truncate font-medium" title={r.email}>
                  {r.email || r.userId}
                </span>
                <span className="flex-shrink-0">{r.success ? "Sent" : r.error ?? "Failed"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
