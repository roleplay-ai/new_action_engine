"use client";

import { useState } from "react";
import { Loader2, Plus, Users } from "lucide-react";
import { assignMemberTag, createParticipantTag } from "@/app/actions/participant-tags";
import type { CohortMember, ParticipantTag } from "@/lib/types";

function initials(name: string | null) {
  if (!name) return "P";
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
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
  const [newTagName, setNewTagName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creatingTag, setCreatingTag] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleTagChange(memberId: string, tagId: string) {
    setBusyId(memberId);
    setError(null);
    const result = await assignMemberTag(cohortId, memberId, tagId || null);
    if (result.error) {
      setError(result.error);
    } else {
      const tag = tags.find((t) => t.id === tagId) ?? null;
      setRoster((current) => current.map((member) => (member.id === memberId ? { ...member, tag } : member)));
    }
    setBusyId(null);
  }

  if (roster.length === 0) {
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
        <div className="trainer-empty">
          <Users size={24} />
          <strong>No participants yet</strong>
          <p>Once a superadmin or admin adds people to this cohort, they'll show up here.</p>
        </div>
      </div>
    );
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
      <ul className="trainer-member-list">
        {roster.map((member) => (
          <li key={member.id} className="trainer-member-row">
            <span className="trainer-facilitator-avatar">{initials(member.fullName)}</span>
            <div className="trainer-facilitator-copy">
              <strong>{member.fullName || "Unnamed participant"}</strong>
              {member.email && <small>{member.email}</small>}
            </div>
            <select
              className="trainer-tag-select"
              value={member.tag?.id ?? ""}
              disabled={busyId === member.id}
              aria-label={`Tag for ${member.fullName || "participant"}`}
              onChange={(event) => void handleTagChange(member.id, event.target.value)}
            >
              <option value="">No tag</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
            {busyId === member.id && <Loader2 size={14} className="trainer-spin" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
