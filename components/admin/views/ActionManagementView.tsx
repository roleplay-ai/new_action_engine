"use client";

import React, { useState, useMemo } from "react";
import { PlusCircle, Edit3, Check, Plus } from "lucide-react";
import { ActionTheme } from "@/lib/types";
import { useEngine } from "@/lib/store";
import { createAction, updateAction, deleteAction } from "@/app/actions/actions";

interface ActionManagementViewProps {
  companyId: string | null;
  role: string;
}

export function ActionManagementView({ companyId, role }: ActionManagementViewProps) {
  const { allActions, refetch } = useEngine();
  const [categoryFilter, setCategoryFilter] = useState<ActionTheme | "All">("All");
  const [form, setForm] = useState({
    theme: "Collaboration" as ActionTheme,
    title: "",
    how: "",
    why: "",
    timeEstimate: "5 mins",
  });
  const [successMsg, setSuccessMsg] = useState("");
  const [editingAction, setEditingAction] = useState<{
    id: string;
    theme: ActionTheme;
    title: string;
    how: string;
    why: string;
    timeEstimate: string;
  } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredActionBank = useMemo(() => {
    return allActions.filter(
      (a) => categoryFilter === "All" || a.theme === categoryFilter
    );
  }, [allActions, categoryFilter]);

  const handleQuickAdd = async () => {
    if (!form.title || !form.how || !form.why) return;
    if (!companyId) {
      setSuccessMsg("Select a company first");
      setTimeout(() => setSuccessMsg(""), 3000);
      return;
    }
    const { error } = await createAction({
      theme: form.theme,
      title: form.title,
      how: form.how,
      why: form.why,
      timeEstimate: form.timeEstimate,
      companyId: role === "superadmin" ? companyId : undefined,
    });
    if (error) {
      setSuccessMsg(error);
      setTimeout(() => setSuccessMsg(""), 4000);
      return;
    }
    setSuccessMsg("Action added to bank!");
    setForm({ ...form, title: "", how: "", why: "" });
    await refetch();
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  const handleUpdateAction = async () => {
    if (!editingAction) return;
    const { error } = await updateAction(editingAction.id, {
      theme: editingAction.theme,
      title: editingAction.title,
      how: editingAction.how,
      why: editingAction.why,
      timeEstimate: editingAction.timeEstimate,
    });
    if (error) {
      setSuccessMsg(error);
      setTimeout(() => setSuccessMsg(""), 4000);
      return;
    }
    setEditingAction(null);
    await refetch();
    setSuccessMsg("Action updated");
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  const handleDeleteAction = async (id: string) => {
    setDeletingId(id);
    const { error } = await deleteAction(id);
    setDeletingId(null);
    if (error) {
      setSuccessMsg(error);
      setTimeout(() => setSuccessMsg(""), 4000);
      return;
    }
    await refetch();
    setSuccessMsg("Action deleted");
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="space-y-1">
          <h2 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            Action Management
          </h2>
          <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Create &amp; manage your micro-action library
          </p>
        </div>
        {successMsg && (
          <span className="tag tag--teal animate-pulse">
            {successMsg}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 1/3: Action Creator Form */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl p-5 flex flex-col sticky top-24" style={{ border: "1px solid var(--color-border-yellow)", boxShadow: "var(--shadow-lg)" }}>
            <div className="flex items-center gap-2 mb-4">
              <PlusCircle size={18} style={{ color: "var(--dodger-blue)" }} />
              <h3 className="text-base font-bold" style={{ color: "var(--color-text-primary)" }}>
                Create New Action
              </h3>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="form-group mb-0">
                  <label className="form-label">Theme</label>
                  <select
                    className="form-input"
                    style={{ fontSize: "var(--text-sm)" }}
                    value={form.theme}
                    onChange={(e) => setForm({ ...form, theme: e.target.value as ActionTheme })}
                  >
                    <option value="Collaboration">Collaboration</option>
                    <option value="Accountability">Accountability</option>
                    <option value="Feedback">Feedback</option>
                    <option value="Connection">Connection</option>
                    <option value="Coaching">Coaching</option>
                  </select>
                </div>
                <div className="form-group mb-0">
                  <label className="form-label">Est. Time</label>
                  <select
                    className="form-input"
                    style={{ fontSize: "var(--text-sm)" }}
                    value={form.timeEstimate}
                    onChange={(e) => setForm({ ...form, timeEstimate: e.target.value })}
                  >
                    <option>2 mins</option>
                    <option>5 mins</option>
                    <option>15 mins</option>
                  </select>
                </div>
              </div>

              <div className="form-group mb-0">
                <label className="form-label">What (Objective Headline)</label>
                <input
                  type="text"
                  placeholder="e.g. End meetings with summary…"
                  className="form-input"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>

              <div className="form-group mb-0">
                <label className="form-label">How (Tactical Step)</label>
                <textarea
                  placeholder="Specify the exact verbal or digital cue…"
                  className="form-input min-h-[56px]"
                  value={form.how}
                  onChange={(e) => setForm({ ...form, how: e.target.value })}
                />
              </div>

              <div className="form-group mb-0">
                <label className="form-label">Why (Behavioral Logic)</label>
                <textarea
                  placeholder="Explain the cognitive impact…"
                  className="form-input min-h-[56px]"
                  value={form.why}
                  onChange={(e) => setForm({ ...form, why: e.target.value })}
                />
              </div>
            </div>

            <button
              onClick={handleQuickAdd}
              className="btn btn--primary btn--full mt-5"
            >
              Register to Bank
            </button>
          </div>
        </div>

        {/* Right 2/3: Action Bank */}
        <div className="lg:col-span-2 space-y-6">
          {/* Action Library (CRUD) */}
          <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-lg)" }}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <h3 className="text-base font-bold flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
                <Edit3 size={16} style={{ color: "var(--dodger-blue)" }} /> Action Library
              </h3>
              <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--color-bg-muted)" }}>
                {["All", "Collaboration", "Feedback", "Accountability", "Connection", "Coaching"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat as ActionTheme | "All")}
                    className="px-2 py-1 rounded-lg text-xs font-semibold transition-all"
                    style={
                      categoryFilter === cat
                        ? { background: "var(--bright-amber)", color: "var(--shadow-grey)" }
                        : { color: "var(--color-text-muted)" }
                    }
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <th className="px-3 py-2 text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Action</th>
                    <th className="px-3 py-2 text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Theme</th>
                    <th className="px-3 py-2 text-xs font-semibold text-right" style={{ color: "var(--color-text-muted)" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActionBank.map((a) => (
                    <tr key={a.id} className="transition-colors" style={{ borderBottom: "1px solid var(--color-border)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-muted)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-semibold truncate max-w-[300px]" style={{ color: "var(--color-text-primary)" }}>
                          {a.title}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="tag tag--blue">{a.theme}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          onClick={() => setEditingAction({ id: a.id, theme: a.theme, title: a.title, how: a.how, why: a.why, timeEstimate: a.timeEstimate })}
                          className="btn btn--decline btn--sm mr-1"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteAction(a.id)}
                          disabled={deletingId === a.id}
                          className="btn btn--sm disabled:opacity-50"
                          style={{ background: "rgba(237,69,81,0.08)", color: "var(--color-danger)", border: "1px solid rgba(237,69,81,0.2)" }}
                        >
                          {deletingId === a.id ? "…" : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredActionBank.length === 0 && (
              <p className="text-sm py-4 text-center" style={{ color: "var(--color-text-muted)" }}>
                No actions yet. Create one using the form.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editingAction && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background: "rgba(34,29,35,0.6)" }}
          onClick={() => setEditingAction(null)}
        >
          <div
            className="card w-full"
            style={{ maxWidth: "512px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="card__title">Edit Action</h4>
            <div className="space-y-4">
              <div className="form-group mb-0">
                <label className="form-label">Theme</label>
                <select
                  value={editingAction.theme}
                  onChange={(e) => setEditingAction({ ...editingAction, theme: e.target.value as ActionTheme })}
                  className="form-input"
                >
                  {["Collaboration", "Accountability", "Feedback", "Connection", "Coaching"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="form-group mb-0">
                <label className="form-label">Title</label>
                <input
                  value={editingAction.title}
                  onChange={(e) => setEditingAction({ ...editingAction, title: e.target.value })}
                  className="form-input"
                />
              </div>
              <div className="form-group mb-0">
                <label className="form-label">How</label>
                <textarea
                  value={editingAction.how}
                  onChange={(e) => setEditingAction({ ...editingAction, how: e.target.value })}
                  className="form-input min-h-[60px]"
                />
              </div>
              <div className="form-group mb-0">
                <label className="form-label">Why</label>
                <textarea
                  value={editingAction.why}
                  onChange={(e) => setEditingAction({ ...editingAction, why: e.target.value })}
                  className="form-input min-h-[60px]"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditingAction(null)} className="btn btn--decline flex-1">
                  Cancel
                </button>
                <button onClick={handleUpdateAction} className="btn btn--primary flex-1">
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
