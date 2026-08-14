"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Plus, Tag, Users, X } from "lucide-react";
import { assignMemberTag, createParticipantTag, deleteParticipantTag } from "@/app/actions/participant-tags";
import type { CohortMember, ParticipantTag } from "@/lib/types";

function initials(name: string | null) {
  if (!name) return "P";
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function buildPending(roster: CohortMember[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const member of roster) map[member.id] = member.tag?.id ?? "";
  return map;
}

export default function MembersClient({
  cohortId,
  initialRoster,
  tags: initialTags,
}: {
  cohortId: string;
  initialRoster: CohortMember[];
  tags: ParticipantTag[];
}) {
  const [roster, setRoster] = useState(initialRoster);
  const [tags, setTags] = useState(initialTags);
  const [pending, setPending] = useState(() => buildPending(initialRoster));
  const [newTagName, setNewTagName] = useState("");
  const [creatingTag, setCreatingTag] = useState(false);
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirtyMemberIds = useMemo(
    () => roster.filter((member) => (pending[member.id] ?? "") !== (member.tag?.id ?? "")).map((member) => member.id),
    [roster, pending]
  );
  const isDirty = dirtyMemberIds.length > 0;

  async function handleCreateTag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = newTagName.trim();
    if (!trimmed || creatingTag) return;

    setCreatingTag(true);
    setError(null);
    const result = await createParticipantTag(trimmed);
    if (result.error) {
      setError(result.error);
    } else if (result.tag) {
      setTags((current) => [...current, result.tag!].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTagName("");
    }
    setCreatingTag(false);
  }

  async function handleDeleteTag(tagId: string, tagName: string) {
    if (deletingTagId) return;
    if (!window.confirm(`Remove the "${tagName}" tag? It will be unassigned from everyone currently wearing it.`)) return;

    setDeletingTagId(tagId);
    setError(null);
    const result = await deleteParticipantTag(tagId);
    if (result.error) {
      setError(result.error);
    } else {
      setTags((current) => current.filter((tag) => tag.id !== tagId));
      setRoster((current) => current.map((member) => (member.tag?.id === tagId ? { ...member, tag: null } : member)));
      setPending((current) => {
        const next = { ...current };
        for (const memberId of Object.keys(next)) {
          if (next[memberId] === tagId) next[memberId] = "";
        }
        return next;
      });
    }
    setDeletingTagId(null);
  }

  function handlePendingChange(memberId: string, tagId: string) {
    setPending((current) => ({ ...current, [memberId]: tagId }));
  }

  function handleDiscard() {
    setPending(buildPending(roster));
    setError(null);
  }

  async function handleSaveTags() {
    if (saving || dirtyMemberIds.length === 0) return;
    setSaving(true);
    setError(null);

    const results = await Promise.all(
      dirtyMemberIds.map(async (memberId) => {
        const tagId = pending[memberId] || null;
        const result = await assignMemberTag(cohortId, memberId, tagId);
        return { memberId, tagId, error: result.error };
      })
    );

    const failed = results.filter((result) => result.error);
    if (failed.length > 0) {
      setError(`Could not save ${failed.length} tag${failed.length > 1 ? "s" : ""}. Try again.`);
    }

    setRoster((current) =>
      current.map((member) => {
        const applied = results.find((result) => result.memberId === member.id && !result.error);
        if (!applied) return member;
        const tag = tags.find((t) => t.id === applied.tagId) ?? null;
        return { ...member, tag };
      })
    );

    setSaving(false);
  }

  return (
    <div className="trainer-members">
      {error && <p className="trainer-notice-error">{error}</p>}

      <form className="trainer-tag-creator" onSubmit={(event) => void handleCreateTag(event)}>
        <input
          value={newTagName}
          onChange={(event) => setNewTagName(event.target.value)}
          placeholder="New tag, e.g. Team A"
          aria-label="New tag name"
          disabled={creatingTag}
        />
        <button type="submit" disabled={creatingTag || !newTagName.trim()}>
          {creatingTag ? <Loader2 size={14} className="trainer-spin" /> : <Plus size={14} />}
          Add tag
        </button>
      </form>

      {tags.length > 0 && (
        <div className="trainer-tag-manager">
          <span className="trainer-tag-manager-label"><Tag size={12} /> Tags</span>
          <div className="trainer-tag-chip-list">
            {tags.map((tag) => (
              <span className="trainer-tag-chip" key={tag.id}>
                {tag.name}
                <button
                  type="button"
                  onClick={() => void handleDeleteTag(tag.id, tag.name)}
                  disabled={deletingTagId === tag.id}
                  aria-label={`Remove tag ${tag.name}`}
                  title="Remove this tag"
                >
                  {deletingTagId === tag.id ? <Loader2 size={11} className="trainer-spin" /> : <X size={11} />}
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {roster.length === 0 ? (
        <div className="trainer-empty">
          <Users size={24} />
          <strong>No participants yet</strong>
          <p>Once a superadmin or admin adds people to this batch, they&apos;ll show up here.</p>
        </div>
      ) : (
        <>
          <ul className="trainer-member-list">
            {roster.map((member) => {
              const dirty = (pending[member.id] ?? "") !== (member.tag?.id ?? "");
              return (
                <li key={member.id} className={`trainer-member-row${dirty ? " trainer-member-row--dirty" : ""}`}>
                  <span className="trainer-facilitator-avatar">{initials(member.fullName)}</span>
                  <div className="trainer-facilitator-copy">
                    <strong>{member.fullName || "Unnamed participant"}</strong>
                    {member.email && <small>{member.email}</small>}
                  </div>
                  <select
                    className="trainer-tag-select"
                    value={pending[member.id] ?? ""}
                    disabled={saving}
                    aria-label={`Tag for ${member.fullName || "participant"}`}
                    onChange={(event) => handlePendingChange(member.id, event.target.value)}
                  >
                    <option value="">No tag</option>
                    {tags.map((tag) => (
                      <option key={tag.id} value={tag.id}>{tag.name}</option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>

          <div className="trainer-tag-save-bar">
            <span>{isDirty ? `${dirtyMemberIds.length} unsaved tag change${dirtyMemberIds.length > 1 ? "s" : ""}` : "All tags saved"}</span>
            <div className="trainer-tag-save-bar-actions">
              <button type="button" onClick={handleDiscard} disabled={!isDirty || saving} className="trainer-tag-save-bar-discard">
                Discard
              </button>
              <button type="button" onClick={() => void handleSaveTags()} disabled={!isDirty || saving}>
                {saving ? <Loader2 size={14} className="trainer-spin" /> : <Check size={14} />}
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
