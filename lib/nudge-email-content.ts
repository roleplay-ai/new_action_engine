/**
 * Editable content for the two manual engagement nudges. The superadmin edits
 * a small plain-text format in the Emails panel, which is rendered per
 * recipient here — both for the live preview (client) and the real send
 * (server), so what the admin sees is exactly what goes out.
 *
 * Format:
 *   {{full_name}}    replaced per recipient (see NUDGE_VARIABLES)
 *   [[Link text]]    that recipient's auto-login link, with this label
 *   **text**         bold
 *   blank line       new paragraph; a single line break stays a line break
 * Everything the admin types is HTML-escaped; only the markers above become
 * markup.
 */

export type NudgeKind = "opened_no_action" | "no_plan";

export const NUDGE_TEMPLATE_KEY = {
  opened_no_action: "opened_no_action",
  no_plan: "no_plan_nudge",
} as const;

export const NUDGE_VARIABLES = [
  { key: "full_name", label: "Participant's full name (from profile)" },
  { key: "first_name", label: "Participant's first name" },
  { key: "company_name", label: "Company name" },
  { key: "batch_name", label: "Batch / module name" },
] as const;

const KNOWN_VARIABLES = new Set<string>(NUDGE_VARIABLES.map((variable) => variable.key));

export const NUDGE_SUBJECT_MAX = 200;
export const NUDGE_BODY_MAX = 5000;

export type NudgeContent = { subject: string; body: string };

export const NUDGE_DEFAULT_CONTENT: Record<NudgeKind, NudgeContent> = {
  opened_no_action: {
    subject: "Hi {{full_name}}, have you completed any of your actions from the {{company_name}} Action Plan?",
    body: [
      "Hi {{full_name}},",
      "You accepted these actions during action planning and have been receiving nudges for them. We noticed you haven’t marked any as **Done** yet.",
      "If you’ve completed an action, please mark it **Done** in your plan.",
      "[[UPDATE MY ACTIONS]]",
      "Need any support with your actions? Just let us know. We’re here to help.",
    ].join("\n\n"),
  },
  no_plan: {
    subject: "Hi {{full_name}}, have you completed your {{company_name}} Action Plan yet?",
    body: [
      "Hi {{full_name}},",
      "The workshop is over, but we noticed you haven’t completed your action plan yet.",
      "Please log in with your credentials and complete it as soon as possible. Your batch has started its action journey, and delaying your plan may leave you too little time to finish alongside your colleagues.",
      "[[COMPLETE MY ACTION PLAN]]",
      "Need help logging in or completing your plan? Just let us know. We’re here to help.",
    ].join("\n\n"),
  },
};

/** Splits text into literal runs and marker tokens, for rendering and for
 * the editor's highlighting. */
export type NudgeToken =
  | { type: "text"; value: string }
  | { type: "variable"; value: string; name: string; known: boolean }
  | { type: "link"; value: string; label: string };

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z_]+)\s*\}\}|\[\[([^\[\]\n]+)\]\]/g;

export function tokenizeNudgeText(text: string): NudgeToken[] {
  const tokens: NudgeToken[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ type: "text", value: text.slice(last, index) });
    if (match[1] !== undefined) {
      tokens.push({ type: "variable", value: match[0], name: match[1], known: KNOWN_VARIABLES.has(match[1]) });
    } else {
      tokens.push({ type: "link", value: match[0], label: match[2].trim() });
    }
    last = index + match[0].length;
  }
  if (last < text.length) tokens.push({ type: "text", value: text.slice(last) });
  return tokens;
}

export function unknownNudgeVariables(text: string): string[] {
  const names = tokenizeNudgeText(text)
    .filter((token): token is Extract<NudgeToken, { type: "variable" }> => token.type === "variable" && !token.known)
    .map((token) => token.name);
  return [...new Set(names)];
}

export function nudgeTextHasLink(text: string): boolean {
  return tokenizeNudgeText(text).some((token) => token.type === "link");
}

type Values = Record<string, unknown>;

function variableValue(values: Values, name: string): string {
  const value = values[name];
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (c) => map[c]);
}

/** Subject line: variables filled, links reduced to their label, no markup. */
export function renderNudgeSubject(subject: string, values: Values): string {
  return tokenizeNudgeText(subject)
    .map((token) =>
      token.type === "text"
        ? token.value
        : token.type === "variable"
          ? token.known
            ? variableValue(values, token.name)
            : ""
          : token.label
    )
    .join("")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.?!])/g, "$1")
    .trim();
}

/** Body paragraphs as trusted HTML fragments. */
export function renderNudgeBodyParagraphs(body: string, values: Values, loginUrl: string): string[] {
  const html = tokenizeNudgeText(body.replace(/\r\n?/g, "\n"))
    .map((token) => {
      if (token.type === "text") return escapeHtml(token.value);
      if (token.type === "variable") return token.known ? escapeHtml(variableValue(values, token.name)) : "";
      return `<a href="${escapeHtml(loginUrl)}" target="_blank" style="color:#1a0dab;font-weight:bold;">${escapeHtml(token.label)}</a>`;
    })
    .join("")
    // Bold after escaping: ** never appears in escaped output or in the
    // generated link markup, so this only ever wraps admin-typed text.
    .replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");

  return html
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => paragraph.replace(/\n/g, "<br />"));
}

/** Validates admin-edited content before a send; returns an error message or null. */
export function validateNudgeContent(content: NudgeContent): string | null {
  const subject = content.subject.trim();
  const body = content.body.trim();
  if (!subject) return "Subject can't be empty";
  if (!body) return "Email text can't be empty";
  if (subject.length > NUDGE_SUBJECT_MAX) return `Subject must be at most ${NUDGE_SUBJECT_MAX} characters`;
  if (body.length > NUDGE_BODY_MAX) return `Email text must be at most ${NUDGE_BODY_MAX} characters`;
  const unknown = unknownNudgeVariables(`${subject}\n${body}`);
  if (unknown.length) return `Unknown variable${unknown.length === 1 ? "" : "s"}: ${unknown.map((name) => `{{${name}}}`).join(", ")}`;
  return null;
}
