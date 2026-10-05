"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, FileSpreadsheet, Search, Shuffle, Users } from "lucide-react";
import { getCohortDetail } from "@/app/actions/cohorts";
import {
  assignMembersTag,
  getCohortTeamNameOverrides,
  listParticipantTags,
  setCohortTeamName,
} from "@/app/actions/participant-tags";
import { exportCohortMembersExcel } from "@/lib/export-cohort-members";
import type { CohortMember, ParticipantTag } from "@/lib/types";
import {
  batchLabel,
  CpError,
  CpNeedBatch,
  CpPageHeader,
  CpSaveBar,
  initials,
  useConfirm,
  useControlPanelBatch,
  useReportViewReady,
  useToast,
  useUnsavedGuard,
} from "./shared";

/** One colour per team slot, used on its card and on every button for it. */
const TEAM_COLORS = ["#1D4ED8", "#15803D", "#7E22CE", "#C2410C", "#0E7490", "#BE185D", "#4D7C0F", "#92400E"];

type TeamSlot = { tag: ParticipantTag; number: number; color: string };

/** The central team list is "Team 1", "Team 2" … "Team n". Those are the
 * slots every batch uses; each batch can rename a slot just for itself. */
function teamSlotsFrom(tags: ParticipantTag[]): TeamSlot[] {
  return tags
    .map((tag) => ({ tag, match: tag.name.trim().match(/^team\s*(\d+)$/i) }))
    .filter((item): item is { tag: ParticipantTag; match: RegExpMatchArray } => Boolean(item.match))
    .map(({ tag, match }) => ({ tag, number: Number(match[1]) }))
    .sort((a, b) => a.number - b.number)
    .map((slot, index) => ({ ...slot, color: TEAM_COLORS[index % TEAM_COLORS.length] }));
}

type Filter = "all" | "none" | string;

export function TeamAssignPanel() {
  const { cohortId, option, loading: optionsLoading } = useControlPanelBatch();
  const [members, setMembers] = useState<CohortMember[]>([]);
  const [slots, setSlots] = useState<TeamSlot[]>([]);
  const [savedNames, setSavedNames] = useState<Record<string, string>>({});
  // The draft: team changes per person (tag id, or null for no team) and new team names.
  const [pendingTeams, setPendingTeams] = useState<Record<string, string | null>>({});
  const [pendingNames, setPendingNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const { show, toast } = useToast();

  const load = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    setError(null);
    const [detail, tags, names] = await Promise.all([
      getCohortDetail(cohortId),
      listParticipantTags(),
      getCohortTeamNameOverrides(cohortId),
    ]);
    const firstError = detail.error || tags.error || names.error;
    if (firstError) setError(firstError);
    setMembers(detail.members ?? []);
    setSlots(teamSlotsFrom(tags.tags ?? []));
    setSavedNames(names.overrides ?? {});
    setPendingTeams({});
    setPendingNames({});
    setLoading(false);
  }, [cohortId]);

  useEffect(() => {
    setTicked(new Set());
    setFilter("all");
    setQuery("");
    setRenamingId(null);
    void load();
  }, [load]);

  const savedNameOf = useCallback((slot: TeamSlot) => savedNames[slot.tag.id] ?? slot.tag.name, [savedNames]);
  const nameOf = useCallback((slot: TeamSlot) => pendingNames[slot.tag.id] ?? savedNameOf(slot), [pendingNames, savedNameOf]);
  const teamOf = useCallback(
    (member: CohortMember): string | null => (member.id in pendingTeams ? pendingTeams[member.id] : member.tag?.id ?? null),
    [pendingTeams]
  );

  const changedPeople = members.filter((member) => member.id in pendingTeams && pendingTeams[member.id] !== (member.tag?.id ?? null));
  const changedNames = slots.filter((slot) => slot.tag.id in pendingNames && pendingNames[slot.tag.id] !== savedNameOf(slot));
  const changes = changedPeople.length + changedNames.length;
  useUnsavedGuard(changes > 0);
  useReportViewReady(!optionsLoading && !loading);

  const slotById = useMemo(() => new Map(slots.map((slot) => [slot.tag.id, slot])), [slots]);
  const sortedMembers = useMemo(() => [...members].sort((a, b) => (a.fullName ?? "").localeCompare(b.fullName ?? "")), [members]);

  if (!cohortId || !option) {
    return (
      <section className="cp-page">
        <CpPageHeader title="Team assign" description="Give everyone in a batch a team." />
        <CpNeedBatch loading={optionsLoading} />
      </section>
    );
  }

  const withoutTeam = members.filter((member) => !teamOf(member)).length;
  const countIn = (slot: TeamSlot) => members.filter((member) => teamOf(member) === slot.tag.id).length;
  const visible = sortedMembers.filter((member) => {
    const needle = query.trim().toLowerCase();
    if (needle && !`${member.fullName ?? ""} ${member.email ?? ""}`.toLowerCase().includes(needle)) return false;
    if (filter === "all") return true;
    if (filter === "none") return !teamOf(member);
    return teamOf(member) === filter;
  });
  const tickedVisible = [...ticked].filter((id) => members.some((member) => member.id === id));
  const allVisibleTicked = visible.length > 0 && visible.every((member) => ticked.has(member.id));

  function setTeams(userIds: string[], tagId: string | null) {
    setPendingTeams((current) => {
      const next = { ...current };
      for (const id of userIds) next[id] = tagId;
      return next;
    });
    setTicked(new Set());
  }

  function shareEqually() {
    const unassigned = sortedMembers.filter((member) => !teamOf(member));
    confirm({
      title: "Share people equally?",
      body: <>{unassigned.length} {unassigned.length === 1 ? "person has" : "people have"} no team. They will be spread evenly across the {slots.length} teams. Nothing is saved until you press “Save changes”.</>,
      confirmLabel: "Yes, share equally",
      onConfirm: () => {
        const counts = new Map(slots.map((slot) => [slot.tag.id, countIn(slot)]));
        const plan: Record<string, string> = {};
        for (const member of unassigned) {
          const smallest = [...slots].sort((a, b) => (counts.get(a.tag.id)! - counts.get(b.tag.id)!) || a.number - b.number)[0];
          counts.set(smallest.tag.id, counts.get(smallest.tag.id)! + 1);
          plan[member.id] = smallest.tag.id;
        }
        setPendingTeams((current) => ({ ...current, ...plan }));
        setFilter("all");
      },
    });
  }

  function applyRename(slot: TeamSlot, value: string) {
    const wanted = value.trim() || slot.tag.name;
    const clash = slots.some((other) => other.tag.id !== slot.tag.id && nameOf(other).toLowerCase() === wanted.toLowerCase());
    if (clash) return setRenameError("Another team in this batch already uses that name.");
    setPendingNames((current) => ({ ...current, [slot.tag.id]: wanted }));
    setRenamingId(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    // One call per destination team, then one per renamed team.
    const groups = new Map<string, string[]>();
    for (const member of changedPeople) {
      const key = pendingTeams[member.id] ?? "";
      groups.set(key, [...(groups.get(key) ?? []), member.id]);
    }
    const results = await Promise.all([
      ...[...groups].map(([tagId, ids]) => assignMembersTag(cohortId!, ids, tagId || null)),
      ...changedNames.map((slot) => setCohortTeamName(cohortId!, slot.tag.id, pendingNames[slot.tag.id])),
    ]);
    setSaving(false);
    const failed = results.find((result) => result.error);
    if (failed) setError(`Some changes could not be saved: ${failed.error}`);
    else show("Teams saved.");
    await load();
  }

  const exportButton = (
    <button
      type="button"
      className="cp-btn cp-btn--secondary"
      disabled={members.length === 0 || changes > 0}
      title={changes > 0 ? "Save your changes first" : "Download the saved teams as an Excel sheet"}
      onClick={() => void exportCohortMembersExcel({ members, teamNameOverrides: savedNames, batchName: option.batchName, moduleName: option.moduleName })}
    >
      <FileSpreadsheet size={16} /> Export Excel
    </button>
  );

  return (
    <section className="cp-page">
      <CpPageHeader title="Team assign" description={<>Give everyone in <strong>{batchLabel(option)}</strong> a team.</>} actions={exportButton} />
      {error && <CpError message={error} onRetry={() => void load()} />}

      {loading && members.length === 0 ? (
        <div className="cp-loading">Loading teams…</div>
      ) : members.length === 0 ? (
        <div className="cp-panel">
          <div className="cp-empty">
            <Users size={22} />
            <strong>No one is in this batch yet</strong>
            <span>Add people first, then come back to choose their teams.</span>
            <Link href="/admin/control-panel/participants" className="cp-btn">Go to participant list</Link>
          </div>
        </div>
      ) : slots.length === 0 ? (
        <div className="cp-panel">
          <div className="cp-empty"><strong>No teams set up yet</strong><span>Ask your super admin to add “Team 1”, “Team 2” and so on to the central team list.</span></div>
        </div>
      ) : (
        <div className="cp-panel">
          {withoutTeam ? (
            <div className="cp-banner cp-banner--todo">
              <span>{withoutTeam} {withoutTeam === 1 ? "person doesn’t" : "people don’t"} have a team yet.</span>
              <span className="cp-banner-actions">
                <button type="button" className="cp-btn cp-btn--small" onClick={() => setFilter("none")}>Show them</button>
                <button type="button" className="cp-btn cp-btn--secondary cp-btn--small" disabled={saving} onClick={shareEqually}><Shuffle size={14} /> Share equally</button>
              </span>
            </div>
          ) : (
            <div className="cp-banner cp-banner--done"><Check size={16} /> Everyone has a team{changes ? " (once you save)" : ""}.</div>
          )}

          <div className="cp-teams" style={{ "--cp-team-cols": Math.min(slots.length, 5) } as React.CSSProperties}>
            {slots.map((slot) => {
              const renamed = nameOf(slot) !== slot.tag.name;
              const nameChanged = changedNames.includes(slot);
              const style = { "--cp-c": slot.color } as React.CSSProperties;
              if (renamingId === slot.tag.id) {
                return (
                  <form
                    key={slot.tag.id}
                    className="cp-team cp-team--on"
                    style={style}
                    onSubmit={(event) => {
                      event.preventDefault();
                      applyRename(slot, renameValue);
                    }}
                  >
                    <span className="cp-team-name">Rename {slot.tag.name}</span>
                    <input
                      className="cp-input"
                      value={renameValue}
                      maxLength={60}
                      placeholder={slot.tag.name}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => event.key === "Escape" && setRenamingId(null)}
                      aria-label={`New name for ${slot.tag.name} in this batch`}
                      autoFocus
                    />
                    {renameError && <span className="cp-team-error">{renameError}</span>}
                    <span className="cp-team-actions">
                      <button type="submit">Done</button>
                      <button type="button" onClick={() => setRenamingId(null)}>Cancel</button>
                    </span>
                    {renamed && (
                      <button type="button" className="cp-team-reset" onClick={() => applyRename(slot, slot.tag.name)}>
                        Use “{slot.tag.name}” again
                      </button>
                    )}
                  </form>
                );
              }
              return (
                <div key={slot.tag.id} className={`cp-team${filter === slot.tag.id ? " cp-team--on" : ""}`} style={style}>
                  <span className="cp-team-name" title={nameOf(slot)}>{nameOf(slot)}</span>
                  {(renamed || nameChanged) && (
                    <span className="cp-team-orig">{slot.tag.name}{nameChanged ? " · new name not saved" : ""}</span>
                  )}
                  <span className="cp-team-count">{countIn(slot)} {countIn(slot) === 1 ? "person" : "people"}</span>
                  <span className="cp-team-actions">
                    <button type="button" onClick={() => setFilter(filter === slot.tag.id ? "all" : slot.tag.id)}>{filter === slot.tag.id ? "Clear filter" : "Filter"}</button>
                    <button type="button" onClick={() => { setRenamingId(slot.tag.id); setRenameValue(renamed ? nameOf(slot) : ""); setRenameError(null); }}>Rename</button>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="cp-toolbar">
            <label className="cp-search">
              <Search size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name" aria-label="Search people" />
            </label>
            {filter !== "all" && (
              <>
                <span className="cp-hint">Showing only <strong>{filter === "none" ? "people without a team" : nameOf(slotById.get(filter)!)}</strong></span>
                <button type="button" className="cp-btn cp-btn--secondary cp-btn--small" onClick={() => setFilter("all")}>Show everyone</button>
              </>
            )}
          </div>

          {tickedVisible.length > 0 && (
            <div className="cp-bulk" role="region" aria-label="Move ticked people">
              <strong>{tickedVisible.length} ticked — put them in:</strong>
              <span className="cp-seg">
                {slots.map((slot) => (
                  <button key={slot.tag.id} type="button" className="cp-seg-btn cp-seg-btn--fill" style={{ "--cp-c": slot.color } as React.CSSProperties} disabled={saving} onClick={() => setTeams(tickedVisible, slot.tag.id)}>
                    {nameOf(slot)}
                  </button>
                ))}
                <button type="button" className="cp-seg-btn cp-seg-btn--none" disabled={saving} onClick={() => setTeams(tickedVisible, null)}>None</button>
              </span>
              <button type="button" className="cp-btn cp-btn--secondary cp-btn--small" onClick={() => setTicked(new Set())}>Untick</button>
            </div>
          )}

          <div className="cp-list-head">
            <label>
              <input
                type="checkbox"
                className="cp-check"
                checked={allVisibleTicked}
                onChange={() =>
                  setTicked((current) => {
                    const next = new Set(current);
                    visible.forEach((member) => (allVisibleTicked ? next.delete(member.id) : next.add(member.id)));
                    return next;
                  })
                }
                aria-label="Tick everyone shown"
              />
              {members.length} people · tick several to move them together
            </label>
            <span>Team</span>
          </div>
          <div className="cp-list">
            {visible.length === 0 && <div className="cp-empty"><strong>No one to show</strong><span>Try a different search or team.</span></div>}
            {visible.map((member) => {
              const teamId = teamOf(member);
              const current = teamId ? slotById.get(teamId) ?? null : null;
              const otherTeam = teamId && !current && member.tag ? savedNames[member.tag.id] ?? member.tag.name : null;
              const changed = changedPeople.includes(member);
              const checked = ticked.has(member.id);
              return (
                <div key={member.id} className={`cp-member${checked ? " cp-member--checked" : ""}${changed ? " cp-member--pending" : ""}`}>
                  <label className="cp-member-id">
                    <input
                      type="checkbox"
                      className="cp-check"
                      checked={checked}
                      onChange={() =>
                        setTicked((prev) => {
                          const next = new Set(prev);
                          if (next.has(member.id)) next.delete(member.id);
                          else next.add(member.id);
                          return next;
                        })
                      }
                      aria-label={`Tick ${member.fullName || "participant"}`}
                    />
                    <span className="cp-avatar">{initials(member.fullName)}</span>
                    <span className="cp-person-copy">
                      <strong>{member.fullName || "Unnamed user"}</strong>
                      <span>{changed ? "Team changed — not saved yet" : otherTeam ? `Other team: ${otherTeam}` : member.email}</span>
                    </span>
                  </label>
                  <span className="cp-seg" role="group" aria-label={`Team for ${member.fullName || "participant"}`}>
                    {slots.map((slot) => {
                      const on = current?.tag.id === slot.tag.id;
                      return (
                        <button
                          key={slot.tag.id}
                          type="button"
                          className={`cp-seg-btn${on ? " cp-seg-btn--on" : ""}`}
                          style={{ "--cp-c": slot.color } as React.CSSProperties}
                          aria-pressed={on}
                          title={nameOf(slot)}
                          disabled={saving}
                          onClick={() => !on && setTeams([member.id], slot.tag.id)}
                        >
                          {nameOf(slot)}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className={`cp-seg-btn cp-seg-btn--none${!teamId ? " cp-seg-btn--on" : ""}`}
                      aria-pressed={!teamId}
                      disabled={saving}
                      onClick={() => teamId && setTeams([member.id], null)}
                    >
                      None
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <CpSaveBar
        changes={changes}
        saving={saving}
        onSave={() => void save()}
        onDiscard={() => { setPendingTeams({}); setPendingNames({}); setRenamingId(null); setTicked(new Set()); }}
      />
      {dialog}
      {toast}
    </section>
  );
}
