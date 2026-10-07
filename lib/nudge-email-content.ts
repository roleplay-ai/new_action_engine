/**
 * Editable content for the two manual engagement nudges. The superadmin edits
 * a small plain-text format in the Emails panel, which is rendered per
 * recipient here — both for the live preview (client) and the real send
 * (server), so what the admin sees is exactly what goes out.
 *
 * Format:
 *   {{full_name}}    replaced per recipient (see NUDGE_VARIABLES)
 *   [[Link text]]    a button to that recipient's auto-login link
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

export const NUDGE_APP_URL = "https://practice.nudgeable.ai";

export const NUDGE_VARIABLES = [
  { key: "full_name", label: "Participant's full name (from profile)" },
  { key: "first_name", label: "Participant's first name" },
  { key: "company_name", label: "Company name" },
  { key: "batch_name", label: "Batch / module name" },
  { key: "app_link", label: `App link (${NUDGE_APP_URL})` },
  { key: "login_email", label: "Participant's login ID" },
  { key: "password", label: "Participant's stored password" },
] as const;

const KNOWN_VARIABLES = new Set<string>(NUDGE_VARIABLES.map((variable) => variable.key));
/** Variables whose value is a URL, rendered as a clickable link in the body. */
const URL_VARIABLES = new Set(["app_link"]);
/** Variables that need each recipient's stored login credentials. */
const CREDENTIAL_VARIABLES = new Set(["login_email", "password"]);
/** Shown when a recipient has no stored password (e.g. their account predates
 * stored credentials). */
export const NUDGE_PASSWORD_FALLBACK = "Use your existing password";

export const NUDGE_SUBJECT_MAX = 200;
export const NUDGE_BODY_MAX = 5000;

export type NudgeContent = { subject: string; body: string };

export const NUDGE_DEFAULT_CONTENT: Record<NudgeKind, NudgeContent> = {
  opened_no_action: {
    subject: "Hi {{first_name}}, have you completed any of your actions from the {{company_name}} Action Plan?",
    // The email's fixed hero already greets the participant and carries the
    // headline (see NUDGE_HERO in lib/email-templates.ts), so the editable
    // body picks up from there.
    body: [
      "We noticed you haven’t marked any as **Done** yet.",
      "If you’ve completed an action, please mark it **Done** in your plan.",
      "[[UPDATE MY ACTIONS]]",
      "Need any support with your actions? Just let us know at team@nudgeable.ai. We’re here to help.",
    ].join("\n\n"),
  },
  no_plan: {
    subject: "Hi {{first_name}}, complete your action plan to stay on track with your batch",
    body: [
      "Your batch has started its action journey. Complete your plan so you have time to practise alongside your colleagues.",
      "[[Complete my action plan]]",
      "**Your login details**\nLogin ID: {{login_email}}\nPassword: {{password}}",
      "Need help logging in or completing your plan? Email us at team@nudgeable.ai.",
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

/** True when the content needs recipients' stored login ID / password. */
export function nudgeContentUsesCredentials(content: NudgeContent): boolean {
  return tokenizeNudgeText(`${content.subject}\n${content.body}`).some(
    (token) => token.type === "variable" && CREDENTIAL_VARIABLES.has(token.name)
  );
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

const LINK_STYLE = "color:#1a0dab;text-decoration:underline;";
/** Capturing, so String.split keeps each address at the odd indexes. */
const EMAIL_IN_TEXT = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;

const BUTTON_STYLE =
  "display:inline-block;padding:12px 26px;background:#FFCE00;border:2px solid #221D23;border-radius:10px;" +
  "color:#221D23;font-size:13px;line-height:16px;font-weight:bold;letter-spacing:.4px;text-decoration:none;";

/** Body paragraphs as trusted HTML fragments. `styles` lets the email design
 * override the inline styles of [[buttons]] and links. */
export function renderNudgeBodyParagraphs(
  body: string,
  values: Values,
  loginUrl: string,
  styles: { buttonStyle?: string; linkStyle?: string } = {},
): string[] {
  const buttonStyle = styles.buttonStyle ?? BUTTON_STYLE;
  const linkStyle = styles.linkStyle ?? LINK_STYLE;
  // Variable values and buttons go in as placeholders and are swapped in
  // after the **bold** pass, so a value that happens to contain ** (e.g. a
  // password) is never reinterpreted as formatting.
  const fragments: string[] = [];
  const placeholder = (html: string) => `${fragments.push(html) - 1}`;

  const html = tokenizeNudgeText(body.replace(/\r\n?/g, "\n"))
    .map((token) => {
      if (token.type === "text") {
        // Typed email addresses become blue mailto links, like the app link.
        return token.value
          .split(EMAIL_IN_TEXT)
          .map((part, index) =>
            index % 2 === 1
              ? placeholder(`<a href="mailto:${escapeHtml(part)}" style="${linkStyle}">${escapeHtml(part)}</a>`)
              : escapeHtml(part)
          )
          .join("");
      }
      if (token.type === "variable") {
        if (!token.known) return "";
        const value = variableValue(values, token.name);
        if (URL_VARIABLES.has(token.name) && /^https?:\/\//i.test(value)) {
          return placeholder(`<a href="${escapeHtml(value)}" target="_blank" style="${linkStyle}">${escapeHtml(value)}</a>`);
        }
        return placeholder(escapeHtml(value));
      }
      return placeholder(`<a href="${escapeHtml(loginUrl)}" target="_blank" style="${buttonStyle}">${escapeHtml(token.label)}</a>`);
    })
    .join("")
    .replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(\d+)/g, (_, index: string) => fragments[Number(index)] ?? "");

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
