"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  UserPlus,
  Users,
  Mail,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  X,
  Check,
  ShieldCheck,
} from "lucide-react";
import {
  createCompanyUser,
  getCompanyUsersWithDetails,
  removeUserFromAdminCompany,
} from "@/app/actions/admin-users";

interface UserManagementViewProps {
  companyId: string | null;
  role: string;
}

interface CompanyUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
}

function CreateUserModal({
  companyId,
  onSuccess,
  onClose,
}: {
  companyId: string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatePassword = () => {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
    let pw = "";
    for (let i = 0; i < 12; i++) {
      pw += chars[Math.floor(Math.random() * chars.length)];
    }
    setPassword(pw);
    setShowPassword(true);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await createCompanyUser({
      email,
      password,
      fullName,
      companyId,
    });
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    onSuccess();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        style={{
          background: "var(--color-bg-base)",
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-xl, 0 24px 64px rgba(0,0,0,0.4))",
        }}
      >
        {/* Modal Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "var(--bright-amber)", color: "var(--shadow-grey)" }}
            >
              <UserPlus size={16} strokeWidth={2.5} />
            </div>
            <div>
              <h3
                className="text-sm font-bold"
                style={{ color: "var(--color-text-primary)" }}
              >
                Create New User
              </h3>
              <p
                className="text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                User will be added to your company
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: "var(--color-text-muted)" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "var(--color-bg-muted)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "transparent")
            }
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="form-group mb-0">
            <label className="form-label">Full Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Jane Smith"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="form-group mb-0">
            <label className="form-label">Email Address</label>
            <div className="relative">
              <Mail
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--color-text-muted)" }}
              />
              <input
                type="email"
                className="form-input pl-9"
                placeholder="user@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group mb-0">
            <div className="flex items-center justify-between mb-1">
              <label className="form-label mb-0">Password</label>
              <button
                type="button"
                onClick={generatePassword}
                className="text-[10px] font-semibold uppercase tracking-wider transition-colors"
                style={{ color: "var(--dodger-blue)" }}
              >
                Generate
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className="form-input pr-10"
                placeholder="Min. 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--color-text-muted)" }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && (
            <div
              className="px-4 py-3 rounded-xl text-xs font-semibold"
              style={{
                background: "rgba(237,69,81,0.08)",
                border: "1px solid rgba(237,69,81,0.25)",
                color: "#ED4551",
              }}
            >
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="btn btn--primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <Check size={14} strokeWidth={2.5} />
                  Create User
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn--decline"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function UserManagementView({
  companyId,
  role,
}: UserManagementViewProps) {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const showStatus = (text: string, type: "success" | "error") => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 3500);
  };

  const loadUsers = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { users: data, error } = await getCompanyUsersWithDetails(companyId);
    setLoading(false);
    if (error) {
      showStatus(error, "error");
    } else {
      setUsers(data ?? []);
    }
  }, [companyId]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleRemove = async (userId: string) => {
    if (!companyId) return;
    setRemovingId(userId);
    const { error } = await removeUserFromAdminCompany(userId, companyId);
    setRemovingId(null);
    if (error) {
      showStatus(error, "error");
    } else {
      showStatus("User removed from company", "success");
      loadUsers();
    }
  };

  const roleColors: Record<string, { bg: string; color: string }> = {
    superadmin: {
      bg: "rgba(130,80,255,0.1)",
      color: "var(--majorelle-blue, #8250ff)",
    },
    admin: {
      bg: "rgba(54,153,252,0.1)",
      color: "var(--dodger-blue)",
    },
    user: {
      bg: "rgba(255,206,0,0.12)",
      color: "var(--bright-amber)",
    },
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">
      {showModal && companyId && (
        <CreateUserModal
          companyId={companyId}
          onSuccess={() => {
            showStatus("User created successfully", "success");
            loadUsers();
          }}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Header */}
      <div
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <div className="space-y-1">
          <h2
            className="text-2xl font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            User Management
          </h2>
          <p
            className="text-xs font-medium"
            style={{ color: "var(--color-text-muted)" }}
          >
            Create &amp; manage users in your company
          </p>
        </div>

        <div className="flex items-center gap-3">
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
            onClick={() => loadUsers()}
            disabled={loading}
            className="btn btn--decline btn--sm flex items-center gap-2"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="btn btn--primary flex items-center gap-2"
          >
            <UserPlus size={15} strokeWidth={2.5} />
            Create User
          </button>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          {
            label: "Total Users",
            value: users.length,
            color: "var(--dodger-blue)",
          },
          {
            label: "Regular Users",
            value: users.filter((u) => u.role === "user").length,
            color: "var(--bright-amber)",
          },
          {
            label: "Admins",
            value: users.filter(
              (u) => u.role === "admin" || u.role === "superadmin"
            ).length,
            color: "var(--emerald, #23ce6b)",
          },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-2xl p-4"
            style={{
              background: "var(--color-bg-base)",
              border: "1px solid var(--color-border)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <p
              className="text-xs font-medium mb-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              {label}
            </p>
            <p className="text-2xl font-bold" style={{ color }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Users Table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Table Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{
            background: "var(--color-bg-dark)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="flex items-center gap-2">
            <Users
              size={15}
              strokeWidth={2}
              style={{ color: "var(--bright-amber)" }}
            />
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "rgba(255,255,255,0.7)" }}
            >
              Company Members
            </span>
          </div>
          <span
            className="text-xs font-semibold"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            {users.length} {users.length === 1 ? "member" : "members"}
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
            <RefreshCw
              size={20}
              className="animate-spin mx-auto mb-3"
              style={{ color: "var(--color-border-strong)" }}
            />
            Loading users…
          </div>
        ) : users.length === 0 ? (
          <div
            className="py-16 text-center"
            style={{ background: "var(--color-bg-base)" }}
          >
            <Users
              size={40}
              className="mx-auto mb-4"
              style={{ color: "var(--color-border-strong)" }}
            />
            <p
              className="text-sm font-semibold mb-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              No users yet
            </p>
            <p
              className="text-xs mb-4"
              style={{ color: "var(--color-text-muted)" }}
            >
              Create your first user to get started
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="btn btn--primary btn--sm inline-flex items-center gap-2"
            >
              <UserPlus size={13} /> Create User
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto" style={{ background: "var(--color-bg-base)" }}>
            <table className="w-full text-left table-fixed min-w-[540px]">
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--color-border)",
                    background: "var(--color-bg-muted)",
                  }}
                >
                  <th className="px-5 py-3 text-xs font-semibold w-[200px]" style={{ color: "var(--color-text-muted)" }}>
                    Name
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>
                    Email
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold w-[110px] text-center" style={{ color: "var(--color-text-muted)" }}>
                    Role
                  </th>
                  {role === "admin" || role === "superadmin" ? (
                    <th className="px-4 py-3 text-xs font-semibold w-[80px] text-right" style={{ color: "var(--color-text-muted)" }}>
                      Actions
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const rc = roleColors[user.role] ?? roleColors.user;
                  const isAdmin =
                    user.role === "admin" || user.role === "superadmin";
                  return (
                    <tr
                      key={user.id}
                      className="transition-colors"
                      style={{ borderBottom: "1px solid var(--color-border)" }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLElement).style.background =
                          "var(--color-bg-muted)")
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLElement).style.background =
                          "transparent")
                      }
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{
                              background: isAdmin
                                ? "var(--dodger-blue)"
                                : "var(--bright-amber)",
                              color: isAdmin ? "white" : "var(--shadow-grey)",
                            }}
                          >
                            {(user.full_name ?? user.email)
                              .substring(0, 2)
                              .toUpperCase()}
                          </div>
                          <span
                            className="text-sm font-semibold truncate"
                            style={{ color: "var(--color-text-primary)" }}
                          >
                            {user.full_name || "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className="text-xs font-medium truncate block max-w-[220px]"
                          style={{ color: "var(--color-text-secondary)" }}
                          title={user.email}
                        >
                          {user.email || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider"
                          style={{ background: rc.bg, color: rc.color }}
                        >
                          {isAdmin && (
                            <ShieldCheck size={11} strokeWidth={2.5} />
                          )}
                          {user.role}
                        </span>
                      </td>
                      {role === "admin" || role === "superadmin" ? (
                        <td className="px-4 py-3.5 text-right">
                          {!isAdmin && (
                            <button
                              onClick={() => handleRemove(user.id)}
                              disabled={removingId === user.id}
                              title="Remove from company"
                              className="w-8 h-8 rounded-lg flex items-center justify-center ml-auto transition-colors disabled:opacity-40"
                              style={{ color: "var(--color-text-muted)" }}
                              onMouseEnter={(e) => {
                                (
                                  e.currentTarget as HTMLElement
                                ).style.background = "rgba(237,69,81,0.1)";
                                (
                                  e.currentTarget as HTMLElement
                                ).style.color = "#ED4551";
                              }}
                              onMouseLeave={(e) => {
                                (
                                  e.currentTarget as HTMLElement
                                ).style.background = "transparent";
                                (
                                  e.currentTarget as HTMLElement
                                ).style.color = "var(--color-text-muted)";
                              }}
                            >
                              {removingId === user.id ? (
                                <RefreshCw size={13} className="animate-spin" />
                              ) : (
                                <Trash2 size={13} />
                              )}
                            </button>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
