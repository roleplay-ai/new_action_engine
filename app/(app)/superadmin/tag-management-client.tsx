"use client";

import { type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown, ChevronRight, Loader2, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import {
  createParticipantTag,
  deleteParticipantTag,
  renameParticipantTag,
  type ParticipantTagUsage,
} from "@/app/actions/participant-tags";

export default function TagManagementClient({
  tags,
  emptyState,
}: {
  tags: ParticipantTagUsage[];
  emptyState: ReactNode;
}) {
  const router = useRouter();
  const [newTagName, setNewTagName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = newTagName.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setError(null);
    const result = await createParticipantTag(trimmed);
    if (result.error) {
      setError(result.error);
    } else {
      setNewTagName("");
      router.refresh();
    }
    setCreating(false);
  }

  function startEdit(tag: ParticipantTagUsage) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setError(null);
  }

  async function handleSaveRename(id: string) {
    const trimmed = editName.trim();
    if (!trimmed) return;
    setSavingId(id);
    setError(null);
    const result = await renameParticipantTag(id, trimmed);
    if (result.error) {
      setError(result.error);
    } else {
      setEditingId(null);
      router.refresh();
    }
    setSavingId(null);
  }

  async function handleDelete(tag: ParticipantTagUsage) {
    const warning =
      tag.memberCount > 0
        ? `"${tag.name}" is assigned to ${tag.memberCount} participant${tag.memberCount === 1 ? "" : "s"} across ${tag.companyCount} compan${tag.companyCount === 1 ? "y" : "ies"}. Delete it anyway? Their tag will just show as unassigned.`
        : `Delete "${tag.name}"?`;
    if (!window.confirm(warning)) return;

    setDeletingId(tag.id);
    setError(null);
    const result = await deleteParticipantTag(tag.id);
    if (result.error) setError(result.error);
    else router.refresh();
    setDeletingId(null);
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-2">
        <input
          value={newTagName}
          onChange={(event) => setNewTagName(event.target.value)}
          placeholder="New tag name (e.g. Team A)"
          disabled={creating}
          className="form-input max-w-xs"
        />
        <button
          type="submit"
          disabled={creating || !newTagName.trim()}
          className="flex items-center gap-1.5 rounded-lg border-2 border-black bg-black px-3 py-2 text-xs font-bold uppercase text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Create tag
        </button>
      </form>

      {error && (
        <div className="rounded-lg border-2 border-red-200 bg-red-50 px-3 py-2">
          <p className="text-xs font-bold text-red-700">{error}</p>
        </div>
      )}

      {tags.length === 0 ? (
        emptyState
      ) : (
        <ul className="grid gap-2">
          {tags.map((tag) => {
            const editing = editingId === tag.id;
            const expanded = expandedIds.has(tag.id);
            const hasBatches = tag.batches.length > 0;
            return (
              <li key={tag.id} className="rounded-xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  {editing ? (
                    <input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      autoFocus
                      className="form-input flex-1 min-w-[160px]"
                    />
                  ) : (
                    <div className="flex min-w-0 flex-col">
                      <strong className="truncate text-sm text-slate-800">{tag.name}</strong>
                      <button
                        type="button"
                        onClick={() => hasBatches && toggleExpanded(tag.id)}
                        disabled={!hasBatches}
                        className="flex items-center gap-3 text-xs text-slate-500 disabled:cursor-default"
                        aria-expanded={expanded}
                        aria-label={hasBatches ? `${expanded ? "Hide" : "Show"} batches using ${tag.name}` : undefined}
                      >
                        <span className="flex items-center gap-1">
                          <Users size={12} /> {tag.memberCount} participant{tag.memberCount === 1 ? "" : "s"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Building2 size={12} /> {tag.companyCount} compan{tag.companyCount === 1 ? "y" : "ies"}
                        </span>
                        {hasBatches && (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
                      </button>
                    </div>
                  )}

                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    {editing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSaveRename(tag.id)}
                          disabled={savingId === tag.id || !editName.trim()}
                          className="superadmin-icon-action success"
                          aria-label="Save"
                        >
                          {savingId === tag.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="superadmin-icon-action"
                          aria-label="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(tag)}
                          className="superadmin-icon-action"
                          aria-label={`Rename ${tag.name}`}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(tag)}
                          disabled={deletingId === tag.id}
                          className="superadmin-icon-action danger"
                          aria-label={`Delete ${tag.name}`}
                        >
                          {deletingId === tag.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {expanded && hasBatches && (
                  <ul className="grid gap-1 border-t border-slate-100 px-4 py-2.5">
                    {tag.batches.map((batch) => (
                      <li key={batch.cohortId} className="flex items-center justify-between gap-3 text-xs text-slate-600">
                        <span className="truncate">
                          <span className="font-semibold text-slate-700">{batch.companyName}</span>
                          <span className="text-slate-400"> — </span>
                          {batch.cohortName}
                          {batch.isRenamed && (
                            <span className="ml-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              shown as &quot;{batch.displayName}&quot; here
                            </span>
                          )}
                        </span>
                        <span className="flex-shrink-0 text-slate-400">
                          {batch.memberCount} member{batch.memberCount === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
