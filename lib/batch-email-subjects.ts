/**
 * Per-batch subject overrides for the recurring participant emails, edited by
 * a superadmin in the batch's Settings tab and stored in
 * cohorts.email_subjects (see migration 086). A missing or blank entry keeps
 * the default subject defined in lib/email-templates.ts.
 *
 * Subjects may use {{placeholders}} (see BATCH_EMAIL_SUBJECT_VARIABLES),
 * filled per recipient when the email is sent.
 */

export const BATCH_EMAIL_SUBJECT_KEYS = ["daily_reminder", "weekly_recap"] as const;

export type BatchEmailSubjectKey = (typeof BATCH_EMAIL_SUBJECT_KEYS)[number];

export type BatchEmailSubjects = Partial<Record<BatchEmailSubjectKey, string>>;

export const BATCH_EMAIL_SUBJECT_OPTIONS: Record<
  BatchEmailSubjectKey,
  { label: string; description: string; defaultSubject: string }
> = {
  daily_reminder: {
    label: "Action reminder",
    description: "Sent on each participant's reminder days.",
    defaultSubject: "Hi {{first_name}} 👋, Your actions are ready — {{company_name}}",
  },
  weekly_recap: {
    label: "Friday week recap",
    description: "Used when actions are still waiting. The \"You're all caught up\" subject is unchanged.",
    defaultSubject: "Hi {{first_name}} 👋 — {{action_count}} actions are still waiting for your confirmation",
  },
};

export const BATCH_EMAIL_SUBJECT_VARIABLES = [
  { key: "first_name", label: "Participant's first name" },
  { key: "company_name", label: "Company name" },
  { key: "batch_name", label: "Batch name" },
  { key: "module_name", label: "Module name" },
  { key: "action_count", label: "Number of actions in the email" },
] as const;

export const BATCH_EMAIL_SUBJECT_MAX = 200;

const KNOWN_VARIABLES = new Set<string>(BATCH_EMAIL_SUBJECT_VARIABLES.map((variable) => variable.key));
const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

export function isBatchEmailSubjectKey(key: string): key is BatchEmailSubjectKey {
  return (BATCH_EMAIL_SUBJECT_KEYS as readonly string[]).includes(key);
}

export function unknownBatchSubjectVariables(subject: string): string[] {
  const names = [...subject.matchAll(VARIABLE_PATTERN)]
    .map((match) => match[1])
    .filter((name) => !KNOWN_VARIABLES.has(name));
  return [...new Set(names)];
}

/** Reads the stored JSON, keeping only known keys with non-blank text. */
export function parseBatchEmailSubjects(value: unknown): BatchEmailSubjects {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: BatchEmailSubjects = {};
  for (const [key, subject] of Object.entries(value as Record<string, unknown>)) {
    if (isBatchEmailSubjectKey(key) && typeof subject === "string" && subject.trim()) {
      result[key] = subject.trim();
    }
  }
  return result;
}

/** Validates admin input before saving. Blank entries are dropped so the
 * email falls back to its default subject. */
export function sanitizeBatchEmailSubjects(
  input: Record<string, string | null | undefined>
): { subjects: BatchEmailSubjects; error?: undefined } | { subjects?: undefined; error: string } {
  const subjects: BatchEmailSubjects = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!isBatchEmailSubjectKey(key)) return { error: `Unknown email "${key}"` };
    const subject = (raw ?? "").replace(/\s+/g, " ").trim();
    if (!subject) continue;
    const label = BATCH_EMAIL_SUBJECT_OPTIONS[key].label;
    if (subject.length > BATCH_EMAIL_SUBJECT_MAX) {
      return { error: `${label} subject must be ${BATCH_EMAIL_SUBJECT_MAX} characters or fewer` };
    }
    const unknown = unknownBatchSubjectVariables(subject);
    if (unknown.length) {
      return { error: `${label} subject uses unknown placeholder${unknown.length === 1 ? "" : "s"}: ${unknown.map((name) => `{{${name}}}`).join(", ")}` };
    }
    subjects[key] = subject;
  }
  return { subjects };
}

/** Fills placeholders for one recipient. Missing values render as empty and
 * leftover separators/whitespace are tidied. */
export function renderBatchEmailSubject(subject: string, values: Record<string, unknown>): string {
  return subject
    .replace(VARIABLE_PATTERN, (_, name: string) => {
      if (!KNOWN_VARIABLES.has(name)) return "";
      const value = values[name];
      return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
    })
    .replace(/\s+/g, " ")
    .replace(/\s+([,.?!])/g, "$1")
    .replace(/\s*[—–-]\s*$/, "")
    .trim();
}
