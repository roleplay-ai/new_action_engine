/**
 * In-app email templates sent via Resend.
 *
 * SendGrid's dynamic templates lived in SendGrid's dashboard and were referenced
 * by an arbitrary template_id; Resend has no equivalent, so templates are code
 * (this file) and referenced by a fixed key instead.
 */

export type EmailTemplateData = Record<string, unknown>;

type WeeklyAction = {
  theme?: string;
  what?: string;
  how?: string;
  why?: string;
  time?: string;
};

function esc(value: unknown): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(value ?? "").replace(/[&<>"']/g, (c) => map[c]);
}

function str(data: EmailTemplateData, key: string, fallback = ""): string {
  const v = data[key];
  return typeof v === "string" && v.trim() ? v : fallback;
}

function emailShell(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            ${bodyHtml}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function headerHtml(data: EmailTemplateData): string {
  const logo = str(data, "company_logo");
  const companyName = str(data, "company_name");
  return `
    <tr>
      <td style="padding:24px 32px;background-color:#111827;" align="center">
        ${logo ? `<img src="${esc(logo)}" alt="${esc(companyName || "Logo")}" height="32" style="display:block;margin:0 auto;" />` : `<span style="color:#ffffff;font-weight:bold;font-size:18px;">${esc(companyName || "Action Engine")}</span>`}
      </td>
    </tr>`;
}

function ctaButtonHtml(url: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 0;">
      <tr>
        <td style="background-color:#111827;border-radius:8px;">
          <a href="${esc(url)}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-weight:bold;font-size:14px;text-decoration:none;">
            ${esc(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

function footerHtml(): string {
  return `
    <tr>
      <td style="padding:20px 32px;background-color:#f9fafb;" align="center">
        <p style="margin:0;color:#9ca3af;font-size:11px;">Sent by Action Engine</p>
      </td>
    </tr>`;
}

// ─── Weekly Challenges ──────────────────────────────────────────────────────

function renderWeeklyChallengesHtml(data: EmailTemplateData): string {
  const firstName = str(data, "first_name", "there");
  const rank = data.rank;
  const league = str(data, "league");
  const score = data.score;
  const status = str(data, "status");
  const loginUrl = str(data, "login_url", "#");
  const actions = Array.isArray(data.actions) ? (data.actions as WeeklyAction[]) : [];

  const statsHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <td align="center" style="padding:8px;">
          <p style="margin:0;color:#6b7280;font-size:11px;text-transform:uppercase;">Rank</p>
          <p style="margin:2px 0 0;color:#111827;font-size:16px;font-weight:bold;">${esc(rank ?? "—")}</p>
        </td>
        <td align="center" style="padding:8px;">
          <p style="margin:0;color:#6b7280;font-size:11px;text-transform:uppercase;">League</p>
          <p style="margin:2px 0 0;color:#111827;font-size:16px;font-weight:bold;">${esc(league || "—")}</p>
        </td>
        <td align="center" style="padding:8px;">
          <p style="margin:0;color:#6b7280;font-size:11px;text-transform:uppercase;">Score</p>
          <p style="margin:2px 0 0;color:#111827;font-size:16px;font-weight:bold;">${esc(score ?? "—")}</p>
        </td>
      </tr>
    </table>`;

  const actionsHtml = actions.length
    ? actions
        .map(
          (a) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border:1px solid #e5e7eb;border-radius:8px;">
      <tr>
        <td style="padding:14px 16px;">
          ${a.theme ? `<p style="margin:0 0 4px;color:#6b7280;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;">${esc(a.theme)}</p>` : ""}
          <p style="margin:0 0 6px;color:#111827;font-size:15px;font-weight:bold;">${esc(a.what)}</p>
          ${a.how ? `<p style="margin:0 0 6px;color:#374151;font-size:13px;">${esc(a.how)}</p>` : ""}
          ${a.why ? `<p style="margin:0;color:#6b7280;font-size:12px;font-style:italic;">${esc(a.why)}</p>` : ""}
          ${a.time ? `<p style="margin:8px 0 0;color:#9ca3af;font-size:11px;">⏱ ${esc(a.time)}</p>` : ""}
        </td>
      </tr>
    </table>`
        )
        .join("")
    : `<p style="margin:0;color:#6b7280;font-size:13px;">New challenges are on the way — check back soon.</p>`;

  return emailShell(`
    ${headerHtml(data)}
    <tr>
      <td style="padding:28px 32px 8px;">
        <p style="margin:0 0 4px;color:#111827;font-size:18px;font-weight:bold;">Hey ${esc(firstName)},</p>
        <p style="margin:0;color:#374151;font-size:13px;">${status ? esc(status) + " — " : ""}here's what's waiting for you this week.</p>
        ${statsHtml}
        ${actionsHtml}
        ${ctaButtonHtml(loginUrl, "Open your dashboard")}
      </td>
    </tr>
    ${footerHtml()}`);
}

// ─── Login credentials ──────────────────────────────────────────────────────

function renderCredentialsHtml(data: EmailTemplateData): string {
  const firstName = str(data, "first_name", "there");
  const loginEmail = str(data, "login_email");
  const password = str(data, "temporary_password");
  const appLoginUrl = str(data, "app_login_url", str(data, "login_url", "#"));

  return emailShell(`
    ${headerHtml(data)}
    <tr>
      <td style="padding:28px 32px;">
        <p style="margin:0 0 4px;color:#111827;font-size:18px;font-weight:bold;">Hey ${esc(firstName)},</p>
        <p style="margin:0 0 20px;color:#374151;font-size:13px;">Here are your login details.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;">
          <tr>
            <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0;color:#6b7280;font-size:11px;text-transform:uppercase;">Email</p>
              <p style="margin:2px 0 0;color:#111827;font-size:14px;font-weight:bold;">${esc(loginEmail)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 16px;">
              <p style="margin:0;color:#6b7280;font-size:11px;text-transform:uppercase;">Temporary password</p>
              <p style="margin:2px 0 0;color:#111827;font-size:14px;font-weight:bold;font-family:monospace;">${esc(password)}</p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;color:#9ca3af;font-size:11px;">For your security, sign in and change this password when you can.</p>
        ${ctaButtonHtml(appLoginUrl, "Log in")}
      </td>
    </tr>
    ${footerHtml()}`);
}

// ─── Calendar invite ────────────────────────────────────────────────────────

function renderCalendarInviteHtml(data: EmailTemplateData): string {
  const firstName = str(data, "first_name", "there");
  const companyName = str(data, "company_name");
  const skill = str(data, "skill");
  const what = str(data, "what");
  const how = str(data, "how");
  const why = str(data, "why");
  const addToCalendarUrl = str(data, "add_to_calendar_url", "#");

  return emailShell(`
    ${headerHtml(data)}
    <tr>
      <td style="padding:28px 32px;">
        <p style="margin:0 0 4px;color:#111827;font-size:18px;font-weight:bold;">Hey ${esc(firstName)},</p>
        <p style="margin:0 0 20px;color:#374151;font-size:13px;">You've scheduled a new action${companyName ? ` with ${esc(companyName)}` : ""}. A calendar invite is attached — or use the button below.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;">
          <tr>
            <td style="padding:14px 16px;">
              ${skill ? `<p style="margin:0 0 4px;color:#6b7280;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;">${esc(skill)}</p>` : ""}
              <p style="margin:0 0 6px;color:#111827;font-size:15px;font-weight:bold;">${esc(what)}</p>
              ${how ? `<p style="margin:0 0 6px;color:#374151;font-size:13px;">${esc(how)}</p>` : ""}
              ${why ? `<p style="margin:0;color:#6b7280;font-size:12px;font-style:italic;">${esc(why)}</p>` : ""}
            </td>
          </tr>
        </table>
        ${ctaButtonHtml(addToCalendarUrl, "Add to Google Calendar")}
      </td>
    </tr>
    ${footerHtml()}`);
}

// ─── Registry ───────────────────────────────────────────────────────────────

export const EMAIL_TEMPLATES = {
  weekly_challenges: {
    label: "Weekly Challenges",
    subject: (data: EmailTemplateData) =>
      `Your Weekly Challenges${(() => {
        const c = str(data, "company_name");
        return c ? ` — ${c}` : "";
      })()}`,
    render: renderWeeklyChallengesHtml,
  },
  credentials: {
    label: "Login Credentials",
    subject: () => "Your Login Credentials",
    render: renderCredentialsHtml,
  },
  calendar_invite: {
    label: "Calendar Invite",
    subject: (data: EmailTemplateData) => `Calendar invite: ${str(data, "what", "Your action")}`,
    render: renderCalendarInviteHtml,
  },
} as const;

export type EmailTemplateKey = keyof typeof EMAIL_TEMPLATES;

export function isEmailTemplateKey(key: string): key is EmailTemplateKey {
  return Object.prototype.hasOwnProperty.call(EMAIL_TEMPLATES, key);
}

export function renderEmailTemplate(
  key: EmailTemplateKey,
  data: EmailTemplateData
): { subject: string; html: string } {
  const template = EMAIL_TEMPLATES[key];
  return { subject: template.subject(data), html: template.render(data) };
}
