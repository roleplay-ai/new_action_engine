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

// ─── Daily/weekly action reminder ──────────────────────────────────────────

type ReminderAction = {
  theme?: string;
  title?: string;
  how?: string;
  timeEstimate?: string;
};

function nudgeableReminderShell(bodyHtml: string, preheader: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @keyframes nudgeFadeUp {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes nudgeBreathe {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.035); }
      }
      .nudge-hero { animation: nudgeFadeUp .55s ease-out both; }
      .nudge-action { animation: nudgeFadeUp .5s ease-out both; }
      .nudge-action-2 { animation-delay: .08s; }
      .nudge-action-3 { animation-delay: .16s; }
      .nudge-cta { animation: nudgeBreathe 2.8s ease-in-out 1s infinite; }
      @media screen and (max-width: 620px) {
        .nudge-wrap { width: 100% !important; }
        .nudge-pad { padding-left: 20px !important; padding-right: 20px !important; }
        .nudge-title { font-size: 28px !important; }
      }
      @media (prefers-reduced-motion: reduce) {
        .nudge-hero, .nudge-action, .nudge-cta {
          animation: none !important;
        }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#fff9e8;color:#221d23;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${esc(preheader)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#fff9e8;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table class="nudge-wrap" role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #eadfba;border-radius:22px;overflow:hidden;box-shadow:0 14px 34px rgba(34,29,35,.08);">
            ${bodyHtml}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderDailyReminderHtml(data: EmailTemplateData): string {
  const firstName = str(data, "first_name", "there");
  const loginUrl = str(data, "login_url", "#");
  const cohortName = str(data, "cohort_name", "your cohort");
  const reminderSchedule = str(data, "reminder_schedule");
  const brandIcon = str(data, "brand_icon", str(data, "company_logo"));
  const actions = Array.isArray(data.actions) ? (data.actions as ReminderAction[]) : [];
  const count = actions.length;

  const actionsHtml = actions.length
    ? actions
        .map(
          (action, index) => `
    <table class="nudge-action nudge-action-${Math.min(index + 1, 3)}" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 12px;border:1px solid #ece7d8;border-radius:14px;background:#fffdf7;">
      <tr>
        <td width="52" valign="top" style="width:52px;padding:16px 0 16px 16px;">
          <div style="width:34px;height:34px;line-height:34px;border-radius:11px;background:#ffce00;color:#221d23;font-size:13px;font-weight:900;text-align:center;">
            ${String(index + 1).padStart(2, "0")}
          </div>
        </td>
        <td style="padding:16px 16px 16px 10px;">
          ${action.theme ? `<span style="display:inline-block;margin:0 0 7px;padding:4px 8px;border-radius:999px;background:#fff1ad;color:#725c00;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">${esc(action.theme)}</span>` : ""}
          <p style="margin:0 0 7px;color:#221d23;font-size:16px;line-height:1.35;font-weight:800;">${esc(action.title)}</p>
          ${action.how ? `<p style="margin:0;color:#5f5860;font-size:13px;line-height:1.55;">${esc(action.how)}</p>` : ""}
          ${action.timeEstimate ? `<p style="margin:10px 0 0;color:#8a8090;font-size:11px;font-weight:700;">&#9201;&nbsp; ${esc(action.timeEstimate)}</p>` : ""}
        </td>
      </tr>
    </table>`
        )
        .join("")
    : `<p style="margin:0;padding:18px;border-radius:14px;background:#fff9e8;color:#5f5860;font-size:13px;line-height:1.5;">Nothing pending right now—nice work staying on top of it.</p>`;

  const preheader = `${count} action${count === 1 ? "" : "s"} from ${cohortName} ${count === 1 ? "is" : "are"} ready.`;

  return nudgeableReminderShell(`
    <tr>
      <td align="center" style="padding:20px 24px;background:#ffce00;border-bottom:1px solid #e7b900;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr>
            ${
              brandIcon
                ? `<td valign="middle" style="padding:0 10px 0 0;">
                    <img src="${esc(brandIcon)}" width="44" height="44" alt="" style="display:block;width:44px;height:44px;border:0;" />
                  </td>`
                : ""
            }
            <td valign="middle" style="color:#221d23;font-size:27px;font-weight:900;letter-spacing:-.055em;">
              nudgeable
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="nudge-pad nudge-hero" style="padding:36px 38px 28px;background:#221d23;">
        <span style="display:inline-block;margin:0 0 14px;padding:6px 10px;border:1px solid rgba(255,206,0,.35);border-radius:999px;color:#ffce00;font-size:9px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;">
          Your next nudge
        </span>
        <h1 class="nudge-title" style="margin:0;color:#ffffff;font-size:34px;line-height:1.08;letter-spacing:-.04em;">
          Small action.<br /><span style="color:#ffce00;">Real momentum.</span>
        </h1>
        <p style="margin:17px 0 0;color:#d8d2d8;font-size:14px;line-height:1.6;">
          Hey ${esc(firstName)}, ${count} action${count === 1 ? "" : "s"} from
          <strong style="color:#ffffff;">${esc(cohortName)}</strong>
          ${count === 1 ? "is" : "are"} ready when you are.
        </p>
      </td>
    </tr>
    <tr>
      <td class="nudge-pad" style="padding:26px 38px 34px;">
        ${
          reminderSchedule
            ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;border-radius:12px;background:#fff9e8;">
                <tr>
                  <td style="padding:11px 14px;color:#725c00;font-size:11px;line-height:1.4;">
                    <strong>Reminder schedule:</strong> ${esc(reminderSchedule)}
                  </td>
                </tr>
              </table>`
            : ""
        }
        ${actionsHtml}
        <table class="nudge-cta" role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 0;">
          <tr>
            <td align="center" style="border-radius:12px;background:#221d23;">
              <a href="${esc(loginUrl)}" target="_blank" style="display:inline-block;padding:15px 28px;color:#ffffff;font-size:14px;font-weight:900;text-decoration:none;">
                Open Workflows&nbsp; &#8594;
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:12px 0 0;color:#8a8090;font-size:10px;line-height:1.5;text-align:center;">
          Secure one-click sign in. No password needed.
        </p>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:20px 28px;background:#fff9e8;border-top:1px solid #eee3be;">
        <p style="margin:0;color:#5f5860;font-size:11px;font-weight:800;">Nudgeable</p>
        <p style="margin:5px 0 0;color:#9a8d80;font-size:10px;">Turn learning into action, one nudge at a time.</p>
      </td>
    </tr>`, preheader);
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
  daily_reminder: {
    label: "Action Reminder",
    subject: (data: EmailTemplateData) => {
      const n = Array.isArray(data.actions) ? data.actions.length : 0;
      const cohort = str(data, "cohort_name");
      return `Nudgeable: Your next workflow${n === 1 ? " is" : "s are"} ready${cohort ? ` — ${cohort}` : ""}`;
    },
    render: renderDailyReminderHtml,
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
