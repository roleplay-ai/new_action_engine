/**
 * In-app email templates sent via Resend.
 *
 * SendGrid's dynamic templates lived in SendGrid's dashboard and were referenced
 * by an arbitrary template_id; Resend has no equivalent, so templates are code
 * (this file) and referenced by a fixed key instead.
 */

import {
  NUDGE_APP_URL,
  NUDGE_DEFAULT_CONTENT,
  renderNudgeBodyParagraphs,
  renderNudgeSubject,
  type NudgeKind,
} from "./nudge-email-content";

export type EmailTemplateData = Record<string, unknown>;

type WeeklyAction = {
  theme?: string;
  what?: string;
  how?: string;
  why?: string;
  time?: string;
  imageUrl?: string;
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
        ${logo
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;background:#FFFFFF;border-radius:12px;">
              <tr>
                <td valign="middle" style="padding:10px 14px;"><img src="${esc(logo)}" alt="${esc(companyName || "Logo")}" height="32" style="display:block;max-height:32px;width:auto;border-radius:5px;" /></td>
              </tr>
            </table>`
      : `<span style="color:#ffffff;font-weight:bold;font-size:18px;">${esc(companyName || "Action Engine")}</span>`}
      </td>
    </tr>`;
}

/**
 * Company logo as a white pill. Renders nothing when there is no logo.
 */
function companyBadgePillHtml(data: EmailTemplateData): string {
  const logo = str(data, "company_logo");
  const companyName = str(data, "company_name");
  if (!logo) return "";
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border-radius:11px;">
      <tr>
        <td valign="middle" style="padding:8px 12px;"><img src="${esc(logo)}" alt="${esc(companyName || "Company")} logo" height="28" style="display:block;max-height:28px;width:auto;border-radius:5px;" /></td>
      </tr>
    </table>`;
}

/**
 * Top row of a hero card: an eyebrow tag on the left and the company logo
 * on the right, on the same line. Falls back to just the eyebrow, full
 * width, when there's no company logo to show.
 */
function heroTopRowHtml(eyebrowHtml: string, data: EmailTemplateData): string {
  const badge = companyBadgePillHtml(data);
  if (!badge) return eyebrowHtml;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td valign="middle" align="left">${eyebrowHtml}</td>
        <td valign="middle" align="right">${badge}</td>
      </tr>
    </table>`;
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
        ${a.imageUrl ? `<td width="104" valign="top" style="width:104px;padding:14px 0 14px 14px;"><img src="${esc(a.imageUrl)}" width="90" height="90" alt="" style="width:90px;height:90px;border-radius:12px;object-fit:cover;display:block;" /></td>` : ""}
        <td style="padding:14px 16px;">
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

// ─── Nudgie design (shared) ─────────────────────────────────────────────────
//
// Shared layout for the participant journey emails: welcome, plan activated,
// action reminder, Friday recap and the two engagement nudges. Logo, yellow
// rule, a hero with greeting/headline and an animated Nudgie, then the
// email-specific body and a "Powered by" footer.

// Animated Nudgie GIFs, hosted in the public "email-assets" Supabase bucket
// (see supabase/migrations/080_email_assets_bucket.sql).
const EMAIL_ASSETS_URL = "https://tyhjrwaoogaqicgxqqwd.supabase.co/storage/v1/object/public/email-assets";

const NUDGIE_GIF = {
  welcome: `${EMAIL_ASSETS_URL}/nudgie-welcome.gif`,
  planActivated: `${EMAIL_ASSETS_URL}/nudgie-plan-activated.gif`,
  actionReminder: `${EMAIL_ASSETS_URL}/nudgie-action-reminder.gif`,
  weeklyRecap: `${EMAIL_ASSETS_URL}/nudgie-weekly-recap.gif`,
  planIncomplete: `${EMAIL_ASSETS_URL}/nudgie-plan-incomplete.gif`,
  actionsUnconfirmed: `${EMAIL_ASSETS_URL}/nudgie-actions-unconfirmed.gif`,
} as const;

const NUDGIE_FALLBACK_LOGO_URL = `${NUDGE_APP_URL}/NudgeableBlack.png`;
const NUDGIE_SUPPORT_EMAIL = "team@nudgeable.ai";

/** Alternating accent (border, top/left stripe) for stacked action cards. */
const NUDGIE_CARD_ACCENTS = [
  { border: "#f0dc8f", stripe: "#ffcf00" },
  { border: "#bfe6cd", stripe: "#92d9ac" },
] as const;

const NUDGIE_TEXT_STYLE = "margin:0 0 18px;font-size:16px;line-height:25px;color:#44444f;";
const NUDGIE_MUTED_STYLE = "margin:0 0 18px;font-size:16px;line-height:25px;color:#64646e;";
const NUDGIE_HELP_STYLE = "margin:8px 0 20px;font-size:14px;line-height:23px;color:#64646e;";
const NUDGIE_LINK_STYLE = "color:#535064;text-decoration:underline;";
const NUDGIE_BUTTON_STYLE =
  "display:inline-block;padding:0 26px;min-width:160px;line-height:48px;font-size:16px;font-weight:700;color:#ffffff;" +
  "text-align:center;text-decoration:none;background-color:#087f46;border:1px solid #087f46;border-radius:8px;mso-line-height-rule:exactly;";

function nudgieButtonHtml(url: string, label: string, options: { ariaLabel?: string; minWidth?: number; margin?: string } = {}): string {
  const style = NUDGIE_BUTTON_STYLE.replace("min-width:160px", `min-width:${options.minWidth ?? 160}px`);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="button-table" style="margin:${options.margin ?? "0 0 20px"};"><tr><td bgcolor="#087f46" align="center" style="background-color:#087f46;border-radius:8px;">
            <a class="button" href="${esc(url)}" target="_blank"${options.ariaLabel ? ` aria-label="${esc(options.ariaLabel)}"` : ""} style="${style}">${label}</a>
          </td></tr></table>`;
}

function nudgieHeadingHtml(text: string): string {
  return `<p style="margin:8px 0 14px;font-size:16px;line-height:24px;font-weight:700;color:#292932;">${esc(text)}</p>`;
}

function nudgieHelpHtml(prompt: string, linkText: string, after = "."): string {
  return `<p style="${NUDGIE_HELP_STYLE}">${esc(prompt)} <a href="mailto:${NUDGIE_SUPPORT_EMAIL}" style="${NUDGIE_LINK_STYLE}">${esc(linkText)}</a>${esc(after)}</p>`;
}

function nudgieCredentialsHtml(loginEmail: string, password: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fafafa" style="width:100%;background-color:#fafafa;border:1px solid #e7e7e9;border-radius:12px;margin:0 0 20px;">
            <tr><td style="padding:18px 20px 10px;"><p style="margin:0 0 4px;font-size:12px;line-height:18px;color:#6b6b75;">Login ID</p><p style="margin:0;font-size:16px;line-height:24px;color:#292932;word-break:break-word;">${esc(loginEmail)}</p></td></tr>
            <tr><td style="padding:0 20px 18px;"><p style="margin:0 0 4px;font-size:12px;line-height:18px;color:#6b6b75;">Password</p><p style="margin:0;font-size:16px;line-height:24px;color:#292932;word-break:break-word;">${esc(password)}</p></td></tr>
          </table>`;
}

/** Action card with an optional illustration and a per-action "Mark done" button. */
function nudgieActionCardHtml(action: { title?: string; imageUrl?: string }, index: number, markDoneUrl: string): string {
  const accent = NUDGIE_CARD_ACCENTS[index % NUDGIE_CARD_ACCENTS.length];
  const title = action.title ?? "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="action-card" bgcolor="#ffffff" style="width:100%;background-color:#ffffff;border:1px solid ${accent.border};border-top:4px solid ${accent.stripe};border-radius:14px;margin:0 0 14px;">
            <tr><td class="action-pad" style="padding:20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;"><tr>
                ${action.imageUrl
      ? `<td class="image-cell" width="116" valign="top" style="width:116px;padding-right:20px;"><img class="action-image" src="${esc(action.imageUrl)}" alt="" width="96" height="96" style="display:block;width:96px;height:96px;background-color:#ffffff;border:0;border-radius:12px;"></td>`
      : ""}
                <td class="copy-cell" valign="top">
                  <p class="action-copy" style="margin:0 0 18px;font-size:18px;line-height:27px;font-weight:600;color:#24242c;">${esc(title)}</p>
                  ${nudgieButtonHtml(markDoneUrl, "&#10003;&nbsp; Mark done", { ariaLabel: `Mark done: ${title}`, minWidth: 126, margin: "0" })}
                </td>
              </tr></table>
            </td></tr>
          </table>`;
}

/** Commitment score + buddy, side by side (stacked on mobile). */
function nudgieScoresRowHtml(data: EmailTemplateData): string {
  const hasFinalisedPlan = data.has_finalised_plan === true;
  const commitmentScore = typeof data.commitment_score === "number" ? data.commitment_score : null;
  const buddyName = str(data, "buddy_name").trim();
  const buddyScore = typeof data.buddy_score === "number" ? data.buddy_score : null;
  const ownScore = hasFinalisedPlan && commitmentScore !== null ? `${Math.round(commitmentScore)}%` : "&mdash;";
  return `<tr><td class="content-pad" style="padding:10px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-top:1px solid #e7e7e9;"><tr><td style="padding:20px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;"><tr>
              <td class="stat-cell own-cell" valign="top" width="45%" style="width:45%;padding:0 20px 0 0;">
                <p style="margin:0 0 6px;font-size:13px;line-height:19px;color:#64646e;">Your commitment score</p>
                <p style="margin:0;font-size:28px;line-height:34px;font-weight:700;color:#23232c;">${ownScore}</p>
              </td>
              <td class="stat-cell buddy-cell" valign="top" width="55%" style="width:55%;padding:0 0 0 24px;border-left:1px solid #e7e7e9;">
                <p style="margin:0 0 6px;font-size:13px;line-height:19px;color:#64646e;">Commitment buddy</p>
                ${buddyName
      ? `<p style="margin:0 0 4px;font-size:17px;line-height:24px;font-weight:600;color:#23232c;">${esc(buddyName)}</p><p style="margin:0;font-size:14px;line-height:22px;color:#64646e;">Commitment score: <strong style="color:#23232c;">${buddyScore !== null ? `${Math.round(buddyScore)}%` : "&mdash;"}</strong></p>`
      : `<p style="margin:0;font-size:17px;line-height:24px;font-weight:600;color:#23232c;">Not assigned</p>`}
              </td>
            </tr></table>
          </td></tr></table>
        </td></tr>`;
}

function nudgiePendingBannerHtml(count: number, url: string): string {
  if (count <= 0) return "";
  return `<tr><td class="content-pad" style="padding:0 32px 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fff9e5" style="width:100%;background-color:#fff9e5;border:1px solid #efe2af;border-radius:8px;">
            <tr><td class="pending-pad" style="padding:10px 14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>
                <td class="pending-copy" valign="middle"><p style="margin:0;font-size:14px;line-height:21px;font-weight:600;color:#555044;">${count} action${count === 1 ? " is" : "s are"} waiting for your update.</p></td>
                <td class="pending-link-cell" width="160" valign="middle" align="right" style="width:160px;padding-left:12px;text-align:right;">
                  <a href="${esc(url)}" target="_blank" style="display:inline-block;font-size:13px;line-height:22px;font-weight:600;color:#665514;text-decoration:underline;padding:2px 0;">Review pending actions&nbsp;&#8594;</a>
                </td>
              </tr></table>
            </td></tr>
          </table>
        </td></tr>`;
}

function nudgieEmailHtml(params: {
  data: EmailTemplateData;
  title: string;
  preheader: string;
  greetingName: string;
  headline: string;
  intro: string;
  mascotCaption: string;
  mascotUrl: string;
  /** Trusted HTML for the main content cell. */
  bodyHtml: string;
  /** Trusted HTML rows (`<tr>…</tr>`) inserted between the body and the footer. */
  extraRowsHtml?: string;
}): string {
  const { data } = params;
  const companyName = str(data, "company_name");
  const companyLogo = str(data, "company_logo");

  // Always a logo above the yellow rule: the company's when it has one
  // uploaded, otherwise the Nudgeable logo (never the company name as text).
  const logoHtml = `<img src="${esc(companyLogo || NUDGIE_FALLBACK_LOGO_URL)}" alt="${esc(companyLogo ? companyName || "Company" : "Nudgeable")}" width="130" style="display:block;width:130px;max-width:100%;height:auto;margin:0 auto;background-color:#ffffff;">`;

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
  <title>${esc(params.title)}</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <style>
    body { margin:0; padding:0; width:100%; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table { border-spacing:0; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { border:0; outline:none; text-decoration:none; display:block; }
    a { text-decoration:none; }
    .action-copy { overflow-wrap:break-word; word-wrap:break-word; }
    @media screen and (max-width:520px) {
      .outer-pad { padding:12px 8px !important; }
      .email-shell { width:100% !important; border-radius:16px !important; }
      .content-pad { padding-left:20px !important; padding-right:20px !important; }
      .headline { font-size:28px !important; line-height:34px !important; }
      .intro { padding-top:24px !important; padding-bottom:22px !important; }
      .hero-copy { padding-right:12px !important; }
      .hero-mascot { width:82px !important; }
      .nudgie-image { width:82px !important; height:82px !important; }
      .nudgie-caption { font-size:12px !important; line-height:17px !important; }
      .pending-pad { padding:10px 14px !important; }
      .pending-copy, .pending-link-cell { display:block !important; width:auto !important; }
      .pending-link-cell { padding:4px 0 0 !important; text-align:left !important; }
      .action-pad { padding:18px !important; }
      .image-cell { display:block !important; width:auto !important; padding:0 0 8px !important; }
      .action-image { width:68px !important; height:68px !important; }
      .copy-cell { display:block !important; width:auto !important; }
      .action-copy { font-size:17px !important; line-height:25px !important; }
      .button-table { width:100% !important; }
      .button { display:block !important; width:100% !important; box-sizing:border-box !important; text-align:center !important; }
      .stat-cell { display:block !important; width:auto !important; }
      .buddy-cell { border-left:0 !important; border-top:1px solid #e7e7e9 !important; padding:16px 0 0 !important; }
      .own-cell { padding:0 0 16px !important; }
      .footer-pad { padding-top:18px !important; padding-bottom:24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f3ed;color:#202027;font-family:Inter,Arial,Helvetica,sans-serif;">
  <div style="display:none;font-size:1px;color:#f5f3ed;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(params.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f3ed" style="width:100%;background-color:#f5f3ed;">
    <tr><td class="outer-pad" align="center" style="padding:28px 12px;">
      <!--[if mso]><table role="presentation" width="640" align="center"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-shell" bgcolor="#ffffff" style="width:100%;max-width:640px;background-color:#ffffff;border-radius:20px;">
        <tr><td align="center" class="content-pad" style="padding:28px 32px 22px;">
          ${logoHtml}
        </td></tr>
        <tr><td class="content-pad" style="padding:0 32px;"><table role="presentation" width="100%"><tr><td height="4" bgcolor="#ffcf00" style="height:4px;line-height:4px;font-size:1px;background-color:#ffcf00;">&nbsp;</td></tr></table></td></tr>
        <tr><td class="content-pad intro" style="padding:28px 32px 26px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;"><tr>
            <td class="hero-copy" valign="middle" style="padding-right:20px;">
              <p style="margin:0 0 10px;font-size:17px;line-height:25px;">Hi ${esc(params.greetingName)},</p>
              <h1 class="headline" style="margin:0 0 12px;font-size:34px;line-height:41px;font-weight:700;letter-spacing:-0.7px;color:#17171e;">${esc(params.headline)}</h1>
              <p style="margin:0;font-size:17px;line-height:26px;color:#575762;">${esc(params.intro)}</p>
            </td>
            <td class="hero-mascot" width="120" valign="middle" align="center" style="width:120px;text-align:center;">
              <p class="nudgie-caption" style="margin:0 0 4px;font-size:13px;line-height:19px;color:#575762;">${esc(params.mascotCaption)}</p>
              <img class="nudgie-image" src="${params.mascotUrl}" alt="Nudgie Coach" width="120" height="120" style="display:block;width:120px;height:120px;margin:0 auto;background-color:#ffffff;">
              <p class="nudgie-caption" style="margin:4px 0 0;font-size:13px;line-height:19px;font-weight:700;color:#17171e;">Nudgie Coach</p>
            </td>
          </tr></table>
        </td></tr>
        <tr><td class="content-pad" style="padding:0 32px;">
          ${params.bodyHtml}
        </td></tr>
        ${params.extraRowsHtml ?? ""}
        <tr><td align="center" class="content-pad footer-pad" style="padding:20px 32px 28px;border-top:1px solid #eeeef0;">
          <p style="margin:0;font-size:11px;line-height:18px;color:#898992;">Powered by Nudgeable.ai</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Login credentials (welcome) ────────────────────────────────────────────

const WELCOME_STEPS = [
  "Create a plan for what you want to work on.",
  "Review and accept actions for your work.",
  "Practise them when the opportunity comes up.",
  "Mark completed actions done.",
];

function renderCredentialsHtml(data: EmailTemplateData): string {
  const firstName = str(data, "first_name", "there");
  const companyName = str(data, "company_name");
  const loginUrl = str(data, "login_url", "#");

  const stepsHtml = WELCOME_STEPS.map(
    (copy, i) => `<tr><td width="28" valign="top" style="width:28px;padding:7px 12px 7px 0;font-size:14px;line-height:23px;font-weight:700;color:#8a6d00;">${i + 1}</td><td style="padding:7px 0;font-size:15px;line-height:23px;color:#555560;">${esc(copy)}</td></tr>`,
  ).join("");

  return nudgieEmailHtml({
    data,
    title: `Hi ${firstName}, your ${companyName ? `${companyName} ` : ""}access is ready`,
    preheader: "Your login details are ready. Create your action plan when you sign in.",
    greetingName: firstName,
    headline: "Your access is ready.",
    intro: "Log in to create your action plan and start practising at work.",
    mascotCaption: "Let’s get started.",
    mascotUrl: NUDGIE_GIF.welcome,
    bodyHtml: `${nudgieCredentialsHtml(str(data, "login_email"), str(data, "temporary_password"))}
          ${nudgieButtonHtml(loginUrl, "Log in")}
          ${nudgieHeadingHtml("How it works")}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 20px;">${stepsHtml}</table>
          ${nudgieHelpHtml("Need help logging in?", "Email us")}`,
  });
}

// ─── Plan activated summary ─────────────────────────────────────────────────

type PlanSummaryAction = { title?: string; date?: string; imageUrl?: string };

/** Shared with lib/action-plan-pdf.ts so the email body and PDF attachment always agree on formatting. */
export function formatPlanActionDate(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  // Callers pass a plain "YYYY-MM-DD" IST calendar date (see utcToISTDate) —
  // format it as UTC so the server's local timezone can never shift the
  // weekday shown in the email by a day.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function renderPlanActivatedSummaryHtml(data: EmailTemplateData): string {
  const firstName = str(data, "first_name", "there");
  const frequency = str(data, "reminder_frequency", "daily").toLowerCase() === "weekly" ? "weekly" : "daily";
  const buddyName = str(data, "buddy_name").trim();
  const planText = str(data, "plan_text");
  const planUrl = str(data, "login_url", `${NUDGE_APP_URL}/actions`);
  const rawActions = Array.isArray(data.actions) ? (data.actions as PlanSummaryAction[]) : [];
  const allActions = rawActions.filter((a) => typeof a.title === "string" && a.title.trim());
  // The email only ever shows the top actions — the participant's chosen
  // order — and points to the attached PDF for the rest, so the message
  // stays short and scannable regardless of how long the full plan is.
  const ACTIONS_SHOWN_LIMIT = 6;
  const actions = allActions.slice(0, ACTIONS_SHOWN_LIMIT);
  const hiddenCount = allActions.length - actions.length;
  const actionsHeading = hiddenCount > 0 ? "Your first actions" : `Your action${actions.length === 1 ? "" : "s"}`;
  const pdfNote = hiddenCount > 0
    ? `All ${allActions.length} actions in your plan are attached to this email as a PDF.`
    : allActions.length > 0
      ? "Your full plan is attached to this email as a PDF."
      : "";

  const actionsHtml = actions.length
    ? actions
      .map((action, i) => {
        const accent = NUDGIE_CARD_ACCENTS[i % NUDGIE_CARD_ACCENTS.length];
        const date = formatPlanActionDate(action.date);
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#ffffff;border:1px solid #e7e7e9;border-left:4px solid ${accent.stripe};border-radius:10px;margin:0 0 12px;"><tr><td style="padding:16px 18px;">
            <p style="margin:0${date ? " 0 7px" : ""};font-size:17px;line-height:25px;color:#292932;font-weight:600;">${esc(action.title)}</p>
            ${date ? `<p style="margin:0;font-size:13px;line-height:20px;color:#72727c;">${esc(date)}</p>` : ""}
          </td></tr></table>`;
      })
      .join("")
    : `<p style="${NUDGIE_MUTED_STYLE}">No actions were found on this plan.</p>`;

  return nudgieEmailHtml({
    data,
    title: `Hi ${firstName}, your action plan is active`,
    preheader: "Your plan is ready. See your first actions and review the full plan.",
    greetingName: firstName,
    headline: "Your action plan is active.",
    intro: "You’ve accepted your actions. Start with the first one when the opportunity comes up at work.",
    mascotCaption: "You’re ready to begin.",
    mascotUrl: NUDGIE_GIF.planActivated,
    bodyHtml: `${planText ? `${nudgieHeadingHtml("Your focus")}<p style="${NUDGIE_MUTED_STYLE}white-space:pre-wrap;">${esc(planText)}</p>` : ""}
          ${nudgieHeadingHtml(actionsHeading)}
          ${actionsHtml}
          ${nudgieButtonHtml(planUrl, "View my action plan", { margin: "8px 0 20px" })}
          ${pdfNote ? `<p style="margin:0 0 20px;font-size:14px;line-height:23px;color:#64646e;">${esc(pdfNote)}</p>` : ""}
          <p style="${NUDGIE_MUTED_STYLE}">Commitment buddy: ${buddyName ? `<strong style="color:#292932;">${esc(buddyName)}</strong>` : "Not assigned"}</p>
          <p style="${NUDGIE_MUTED_STYLE}">You’ll receive ${frequency} action reminders. Mark each action done after you’ve completed it.</p>`,
  });
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
  id?: string;
  theme?: string;
  title?: string;
  how?: string;
  timeEstimate?: string;
  complete_url?: string;
  imageUrl?: string;
};

function reminderActionsFrom(data: EmailTemplateData): ReminderAction[] {
  return Array.isArray(data.actions) ? (data.actions as ReminderAction[]) : [];
}

/** Action cards; each "Mark done" uses the action's own completion link,
 * falling back to the app login when the sender didn't provide one. */
function reminderActionCardsHtml(actions: ReminderAction[], loginUrl: string): string {
  return actions.map((action, i) => nudgieActionCardHtml(action, i, action.complete_url || loginUrl)).join("");
}

function renderDailyReminderHtml(data: EmailTemplateData): string {
  const firstName = str(data, "first_name", "there");
  const loginUrl = str(data, "login_url", "#");
  const actions = reminderActionsFrom(data);

  return nudgieEmailHtml({
    data,
    title: `Hi ${firstName}, ready to record your progress?`,
    preheader: "Completed an action? Mark it done and record your progress.",
    greetingName: firstName,
    headline: "Ready to record your progress?",
    intro: "Mark each action you’ve completed.",
    mascotCaption: "One tap to record it.",
    mascotUrl: NUDGIE_GIF.actionReminder,
    bodyHtml: actions.length
      ? reminderActionCardsHtml(actions, loginUrl)
      : `<p style="${NUDGIE_MUTED_STYLE}">Nothing pending right now. Nice work staying on top of it.</p>`,
    extraRowsHtml: nudgieScoresRowHtml(data) + nudgiePendingBannerHtml(actions.length, loginUrl),
  });
}

// ─── Friday week recap ──────────────────────────────────────────────────────

function renderWeeklyRecapHtml(data: EmailTemplateData): string {
  const firstName = str(data, "first_name", "there");
  const loginUrl = str(data, "login_url", "#");
  const completeAllUrl = str(data, "complete_all_url");
  const actions = reminderActionsFrom(data);
  const count = actions.length;

  const bodyHtml = count === 0
    ? `<p style="${NUDGIE_MUTED_STYLE}">No open actions to confirm. Have a good weekend.</p>`
    : `${reminderActionCardsHtml(actions, loginUrl)}
          ${completeAllUrl
      ? `<p style="${NUDGIE_MUTED_STYLE}">Completed every action shown above?</p>
          ${nudgieButtonHtml(completeAllUrl, "Confirm all as completed")}
          <p style="${NUDGIE_MUTED_STYLE}">Use this only if you’ve completed every action shown above. For individual actions, use “Mark done”.</p>`
      : ""}`;

  return nudgieEmailHtml({
    data,
    title: `Hi ${firstName}, what did you complete this week?`,
    preheader: count === 0
      ? "You’re all caught up this week."
      : "Completed an action this week? Mark it done below.",
    greetingName: firstName,
    headline: count === 0 ? "You’re all caught up this week." : "What did you complete this week?",
    intro: count === 0 ? "Nothing is waiting for your update." : "If you’ve completed an action, mark it done below.",
    mascotCaption: "Time for a quick recap.",
    mascotUrl: NUDGIE_GIF.weeklyRecap,
    bodyHtml,
    extraRowsHtml: nudgieScoresRowHtml(data) + nudgiePendingBannerHtml(count, loginUrl),
  });
}

// ─── Cohort announcement ────────────────────────────────────────────────────

function renderAnnouncementHtml(data: EmailTemplateData): string {
  const firstName = str(data, "first_name", "there");
  const batchName = str(data, "batch_name");
  const postedBy = str(data, "posted_by");
  const message = str(data, "message");
  const loginUrl = str(data, "login_url", "#");
  const preheader = `${postedBy || "Your trainer"} posted a new announcement${batchName ? ` for ${batchName}` : ""}.`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>New announcement</title>
    <style>
      body { margin: 0; padding: 0; background: #F6F2E6; }
      table { border-spacing: 0; }
      td { padding: 0; }
      a { color: inherit; }

      @media only screen and (max-width: 620px) {
        .shell { width: 100% !important; }
        .pad { padding-left: 20px !important; padding-right: 20px !important; }
        .headline { font-size: 29px !important; line-height: 31px !important; }
        .cta { width: 100% !important; }
      }
    </style>
  </head>
  <body>
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#F6F2E6;">
      <tr>
        <td align="center" style="padding:18px 8px 30px;">
          <table role="presentation" class="shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#FFFFFF;border-top:3px solid #FFCE00;border-left:1px solid #E8DFC6;border-right:1px solid #E8DFC6;border-bottom:1px solid #E8DFC6;">

            <tr>
              <td class="pad" style="padding:30px 34px 28px;background:#221D23;color:#FFFFFF;font-family:Inter,Arial,sans-serif;">
                ${heroTopRowHtml(`<div style="display:inline-block;padding:6px 10px;border:1px solid #756510;border-radius:18px;color:#FFCE00;font-size:9px;line-height:10px;font-weight:800;letter-spacing:1.15px;text-transform:uppercase;">New announcement</div>`, data)}
                <div class="headline" style="margin-top:16px;font-size:34px;line-height:36px;font-weight:800;letter-spacing:-1.25px;">There&apos;s an update<br /><span style="color:#FFCE00;">for you.</span></div>
                <div style="margin-top:12px;color:#E2DEE1;font-size:13px;line-height:19px;">Hey ${esc(firstName)}, ${esc(postedBy || "your trainer")} shared a new announcement${batchName ? ` for ${esc(batchName)}` : ""}.</div>
              </td>
            </tr>

            <tr>
              <td class="pad" style="padding:22px 34px 8px;font-family:Inter,Arial,sans-serif;">
                <div style="font-size:17px;line-height:21px;font-weight:800;color:#221D23;">Announcement</div>
              </td>
            </tr>

            <tr>
              <td class="pad" style="padding:0 34px 8px;font-family:Inter,Arial,sans-serif;">
                <div style="padding:18px 18px;background:#FFFFFF;border:1px solid #E8DFC6;border-radius:14px;color:#3D3740;font-size:14px;line-height:22px;white-space:pre-wrap;">${esc(message)}</div>
              </td>
            </tr>

            <tr>
              <td class="pad" style="padding:8px 34px 2px;font-family:Inter,Arial,sans-serif;">
                <div style="padding:11px 13px;background:#FFF8D9;border-radius:11px;color:#4F484D;font-size:11px;line-height:16px;"><strong style="color:#221D23;">Want to respond or check what&apos;s next?</strong> Open your dashboard to stay up to date with your batch.</div>
              </td>
            </tr>

            <tr>
              <td class="pad" align="center" style="padding:14px 34px 24px;font-family:Inter,Arial,sans-serif;">
                <table role="presentation" class="cta" cellpadding="0" cellspacing="0" border="0">
                  <tr><td align="center" style="background:#FFCE00;border:2px solid #221D23;border-radius:10px;box-shadow:3px 3px 0 #221D23;"><a href="${esc(loginUrl)}" target="_blank" style="display:block;padding:13px 34px;color:#221D23;text-decoration:none;font-size:12px;line-height:16px;font-weight:900;letter-spacing:.5px;text-transform:uppercase;">Open Dashboard</a></td></tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="pad" style="padding:0 34px 22px;font-family:Inter,Arial,sans-serif;text-align:center;">
                <div style="padding-top:15px;border-top:1px solid #ECE7E0;color:#8B8489;font-size:10px;line-height:15px;">Powered by <a href="https://www.nudgeable.ai" style="color:#623CEA;text-decoration:none;font-weight:700;">Nudgeable.ai</a></div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// ─── Team commitment leaderboard ────────────────────────────────────────────

type LeaderboardTeamRow = {
  rank?: number;
  teamName?: string;
  averageScore?: number | null;
};

function renderTeamLeaderboardHtml(data: EmailTemplateData): string {
  const firstName = str(data, "first_name", "there");
  const batchName = str(data, "batch_name");
  const loginUrl = str(data, "login_url", "#");
  const teams = Array.isArray(data.teams) ? (data.teams as LeaderboardTeamRow[]) : [];
  const preheader = `See how every team in${batchName ? ` ${batchName}` : " your batch"} is doing on Commitment Score.`;

  const rowsHtml = teams
    .map((team, index) => {
      const isTop = index === 0 && team.averageScore != null;
      const scoreLabel = team.averageScore == null ? "—" : `${Math.round(team.averageScore)}%`;
      return `
        <tr>
          <td style="padding:12px 14px;border-bottom:1px solid #ECE7E0;font-family:Inter,Arial,sans-serif;font-size:13px;font-weight:800;color:${isTop ? "#221D23" : "#69626A"};width:36px;">#${esc(team.rank ?? index + 1)}</td>
          <td style="padding:12px 14px;border-bottom:1px solid #ECE7E0;font-family:Inter,Arial,sans-serif;font-size:14px;font-weight:${isTop ? "800" : "700"};color:#221D23;">${esc(team.teamName || "Unassigned")}</td>
          <td align="right" style="padding:12px 14px;border-bottom:1px solid #ECE7E0;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:900;color:${isTop ? "#B8862B" : "#221D23"};">${esc(scoreLabel)}</td>
        </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Team Commitment Leaderboard</title>
    <style>
      body { margin: 0; padding: 0; background: #F6F2E6; }
      table { border-spacing: 0; }
      td { padding: 0; }
      a { color: inherit; }

      @media only screen and (max-width: 620px) {
        .shell { width: 100% !important; }
        .pad { padding-left: 20px !important; padding-right: 20px !important; }
        .headline { font-size: 29px !important; line-height: 31px !important; }
        .cta { width: 100% !important; }
      }
    </style>
  </head>
  <body>
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#F6F2E6;">
      <tr>
        <td align="center" style="padding:18px 8px 30px;">
          <table role="presentation" class="shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#FFFFFF;border-top:3px solid #FFCE00;border-left:1px solid #E8DFC6;border-right:1px solid #E8DFC6;border-bottom:1px solid #E8DFC6;">

            <tr>
              <td class="pad" style="padding:30px 34px 28px;background:#221D23;color:#FFFFFF;font-family:Inter,Arial,sans-serif;">
                ${heroTopRowHtml(`<div style="display:inline-block;padding:6px 10px;border:1px solid #756510;border-radius:18px;color:#FFCE00;font-size:9px;line-height:10px;font-weight:800;letter-spacing:1.15px;text-transform:uppercase;">Team leaderboard</div>`, data)}
                <div class="headline" style="margin-top:16px;font-size:34px;line-height:36px;font-weight:800;letter-spacing:-1.25px;">How every team<br /><span style="color:#FFCE00;">is doing.</span></div>
                
              </td>
            </tr>

            <tr>
              <td class="pad" style="padding:22px 34px 8px;font-family:Inter,Arial,sans-serif;">
                <div style="font-size:17px;line-height:21px;font-weight:800;color:#221D23;">Team standings</div>
              </td>
            </tr>

            <tr>
              <td class="pad" style="padding:0 34px 8px;font-family:Inter,Arial,sans-serif;">
                ${teams.length === 0
      ? `<div style="padding:18px 18px;background:#FFFFFF;border:1px solid #E8DFC6;border-radius:14px;color:#69626A;font-size:13px;line-height:20px;">No teams have a finalised plan yet.</div>`
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E8DFC6;border-radius:14px;overflow:hidden;">${rowsHtml}</table>`}
              </td>
            </tr>

            <tr>
              <td class="pad" style="padding:8px 34px 2px;font-family:Inter,Arial,sans-serif;">
                <div style="padding:11px 13px;background:#FFF8D9;border-radius:11px;color:#4F484D;font-size:11px;line-height:16px;"><strong style="color:#221D23;">Want to see where you stand?</strong> Open your dashboard to check your own Commitment Score.</div>
              </td>
            </tr>

            <tr>
              <td class="pad" align="center" style="padding:14px 34px 24px;font-family:Inter,Arial,sans-serif;">
                <table role="presentation" class="cta" cellpadding="0" cellspacing="0" border="0">
                  <tr><td align="center" style="background:#FFCE00;border:2px solid #221D23;border-radius:10px;box-shadow:3px 3px 0 #221D23;"><a href="${esc(loginUrl)}" target="_blank" style="display:block;padding:13px 34px;color:#221D23;text-decoration:none;font-size:12px;line-height:16px;font-weight:900;letter-spacing:.5px;text-transform:uppercase;">Open Dashboard</a></td></tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="pad" style="padding:0 34px 22px;font-family:Inter,Arial,sans-serif;text-align:center;">
                <div style="padding-top:15px;border-top:1px solid #ECE7E0;color:#8B8489;font-size:10px;line-height:15px;">Powered by <a href="https://www.nudgeable.ai" style="color:#623CEA;text-decoration:none;font-weight:700;">Nudgeable.ai</a></div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// ─── Engagement nudges (manual, superadmin-sent) ────────────────────────────

/** Admin-editable nudge (see lib/nudge-email-content.ts): `custom_subject` /
 * `custom_body` carry the superadmin's edited text, falling back to the
 * default wording when absent. */
function nudgeContent(kind: NudgeKind, data: EmailTemplateData) {
  const defaults = NUDGE_DEFAULT_CONTENT[kind];
  return {
    subject: renderNudgeSubject(str(data, "custom_subject", defaults.subject), data),
    body: str(data, "custom_body", defaults.body),
  };
}

/** Fixed hero per nudge; the admin's editable text renders below it. */
const NUDGE_HERO: Record<NudgeKind, {
  title: (name: string) => string;
  preheader: string;
  headline: string;
  intro: string;
  mascotCaption: string;
  mascotUrl: string;
}> = {
  no_plan: {
    title: (name) => `Hi ${name}, complete your action plan`,
    preheader: "Your batch has started its action journey. Complete your plan to practise alongside them.",
    headline: "Set up your action plan.",
    intro: "Your workshop is complete. Choose actions to practise at work.",
    mascotCaption: "Let’s get your plan ready.",
    mascotUrl: NUDGIE_GIF.planIncomplete,
  },
  opened_no_action: {
    title: (name) => `Hi ${name}, your actions need an update`,
    preheader: "If you’ve completed an action, mark it done in your plan.",
    headline: "Your actions need an update.",
    intro: "You accepted these actions during action planning and have been receiving nudges for them.",
    mascotCaption: "What’s getting in the way?",
    mascotUrl: NUDGIE_GIF.actionsUnconfirmed,
  },
};

function renderNudgeEmail(kind: NudgeKind, data: EmailTemplateData): string {
  const { body } = nudgeContent(kind, data);
  const hero = NUDGE_HERO[kind];
  const name = str(data, "full_name", str(data, "first_name", "there"));
  const paragraphs = renderNudgeBodyParagraphs(body, data, str(data, "login_url", "#"), {
    buttonStyle: NUDGIE_BUTTON_STYLE,
    linkStyle: NUDGIE_LINK_STYLE,
  });
  return nudgieEmailHtml({
    data,
    title: hero.title(name),
    preheader: hero.preheader,
    greetingName: name,
    headline: hero.headline,
    intro: hero.intro,
    mascotCaption: hero.mascotCaption,
    mascotUrl: hero.mascotUrl,
    bodyHtml: paragraphs.map((html) => `<p style="${NUDGIE_TEXT_STYLE}">${html}</p>`).join("\n          "),
  });
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
    subject: (data: EmailTemplateData) =>
      `Hi ${str(data, "first_name", "there")} 👋 - Welcome to ${str(data, "company_name", "Nudgeable")}, your access is ready`,
    render: renderCredentialsHtml,
  },
  plan_activated_summary: {
    label: "Plan Finalised Summary",
    subject: (data: EmailTemplateData) => `Hi ${str(data, "first_name", "there")} 👋, your plan is finalised and active`,
    render: renderPlanActivatedSummaryHtml,
  },
  calendar_invite: {
    label: "Calendar Invite",
    subject: (data: EmailTemplateData) => `Calendar invite: ${str(data, "what", "Your action")}`,
    render: renderCalendarInviteHtml,
  },
  daily_reminder: {
    label: "Action Reminder",
    subject: (data: EmailTemplateData) => {
      const name = str(data, "first_name", "there");
      const company = str(data, "company_name");
      return `Hi ${name} 👋, Your actions are ready${company ? ` — ${company}` : ""}`;
    },
    render: renderDailyReminderHtml,
  },
  weekly_recap: {
    label: "Friday Week Recap",
    subject: (data: EmailTemplateData) => {
      const name = str(data, "first_name", "there");
      const count = Array.isArray(data.actions) ? data.actions.length : 0;
      if (count === 0) return `Hi ${name} 👋 — You're all caught up this week`;
      return `Hi ${name} 👋 — ${count} action${count === 1 ? " is" : "s are"} still waiting for your confirmation`;
    },
    render: renderWeeklyRecapHtml,
  },
  announcement: {
    label: "Batch Announcement",
    subject: (data: EmailTemplateData) => {
      const batch = str(data, "batch_name");
      return `New announcement${batch ? ` — ${batch}` : ""}`;
    },
    render: renderAnnouncementHtml,
  },
  team_leaderboard: {
    label: "Team Commitment Leaderboard",
    subject: (data: EmailTemplateData) => {
      const name = str(data, "first_name", "there");
      const batch = str(data, "batch_name");
      return `Hi ${name} 👋 — Team Commitment Leaderboard${batch ? ` — ${batch}` : ""}`;
    },
    render: renderTeamLeaderboardHtml,
  },
  opened_no_action: {
    label: "Opened, No Action Nudge",
    subject: (data: EmailTemplateData) => nudgeContent("opened_no_action", data).subject,
    render: (data: EmailTemplateData) => renderNudgeEmail("opened_no_action", data),
  },
  no_plan_nudge: {
    label: "No Plan Yet Nudge",
    subject: (data: EmailTemplateData) => nudgeContent("no_plan", data).subject,
    render: (data: EmailTemplateData) => renderNudgeEmail("no_plan", data),
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
