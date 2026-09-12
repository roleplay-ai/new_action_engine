/** Parses and sanity-checks the "program agenda" JSON an admin/superadmin
 * pastes in when editing a batch (cohort). Returns undefined (no change)
 * when the field was left blank (input === undefined), or an error message
 * when the JSON doesn't parse or doesn't look like a phase array. Passing an
 * empty/whitespace-only string clears the agenda (phases: []). */
export function parseProgramPhasesJson(raw: string | undefined): { phases?: unknown[]; error?: string } {
  if (raw === undefined) return {};
  const trimmed = raw.trim();
  if (!trimmed) return { phases: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { error: "Program agenda must be valid JSON (an array of phases)." };
  }
  if (!Array.isArray(parsed)) return { error: "Program agenda JSON must be an array of phases." };
  for (const phase of parsed) {
    if (!phase || typeof phase !== "object" || typeof (phase as Record<string, unknown>).id !== "string" || typeof (phase as Record<string, unknown>).label !== "string") {
      return { error: 'Each phase needs at least an "id" and a "label" string.' };
    }
  }
  return { phases: parsed };
}
