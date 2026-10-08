/**
 * Timing for the reminder-email "Mark done" sequence: Nudgie dances on
 * /auth/callback, walks through the door while /actions loads, then writes in
 * the notebook while the action is saved (docs/SURPRISE_BOXES_PLAN.md).
 *
 * Each step stays up for at least one full play of its animation. The record
 * lives in sessionStorage because /auth/callback hands over to /actions with a
 * full page load. Every storage access is guarded: without storage, each step
 * simply starts its own minimum when first asked.
 */

/** Length of one play of each animation in public/loader/. */
export const EMAIL_SEQUENCE_MS = {
  dance: 3220,
  door: 7220,
  notebook: 7290,
} as const;

export type EmailSequencePhase = keyof typeof EMAIL_SEQUENCE_MS;

const STORAGE_KEY = "nudgeable:email-link-sequence";

type SequenceRecord = { phase: EmailSequencePhase; startedAt: number };

function read(): SequenceRecord | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SequenceRecord>;
    if (!parsed.phase || !(parsed.phase in EMAIL_SEQUENCE_MS) || typeof parsed.startedAt !== "number") return null;
    return parsed as SequenceRecord;
  } catch {
    return null;
  }
}

function write(record: SequenceRecord) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage unavailable (private mode, blocked): timing falls back to per-page.
  }
}

/** Marks `phase` as starting now. */
export function startEmailSequencePhase(phase: EmailSequencePhase) {
  write({ phase, startedAt: Date.now() });
}

/**
 * Milliseconds left before `phase` has played once. If `phase` isn't the
 * recorded current step (e.g. storage was cleared), it starts now.
 */
export function remainingEmailSequenceMs(phase: EmailSequencePhase, now = Date.now()): number {
  let record = read();
  if (!record || record.phase !== phase) {
    record = { phase, startedAt: now };
    write(record);
  }
  return Math.max(0, EMAIL_SEQUENCE_MS[phase] - (now - record.startedAt));
}

/** Resolves once `phase` has played at least once. */
export function waitForEmailSequencePhase(phase: EmailSequencePhase): Promise<void> {
  const ms = remainingEmailSequenceMs(phase);
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function clearEmailSequence() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
