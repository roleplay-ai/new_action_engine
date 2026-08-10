"use client";

import { useState } from "react";
import { Loader2, Users } from "lucide-react";
import { assignMemberTag } from "@/app/actions/participant-tags";
import type { CohortMember, ParticipantTag } from "@/lib/types";

function initials(name: string | null) {
  if (!name) return "P";
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export default function MembersClient({
  cohortId,
  initialRoster,
  tags,
}: {
  cohortId: string;
  initialRoster: CohortMember[];
  tags: ParticipantTag[];
}) {
  const [roster, setRoster] = useState(initialRoster);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <div className="trainer-empty">
        <Users size={24} />
        <strong>No participants yet</strong>
        <p>Once a superadmin or admin adds people to this cohort, they'll show up here.</p>
      </div>
    );
  }

  return (
    <div className="trainer-members">
      {error && <p className="trainer-notice-error">{error}</p>}
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
