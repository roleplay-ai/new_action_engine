/**
 * In-app email templates sent via Resend.
 *
 * SendGrid's dynamic templates lived in SendGrid's dashboard and were referenced
 * by an arbitrary template_id; Resend has no equivalent, so templates are code
 * (this file) and referenced by a fixed key instead.
 */

import { nextMilestoneFor, milestonePoints } from "./commitment-wallet-milestones";

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

/**
 * Company logo + name as a white pill. With no logo it falls back to just
 * the name as text, matching headerHtml's own graceful-degradation
 * behavior; with neither, it renders nothing.
 */
function companyBadgePillHtml(data: EmailTemplateData): string {
  const logo = str(data, "company_logo");
  const companyName = str(data, "company_name");
  if (!logo && !companyName) return "";
  const logoCell = logo
    ? `<td valign="middle" style="padding:8px 0 8px 12px;"><img src="${esc(logo)}" alt="${esc(companyName || "Company")} logo" height="28" style="display:block;max-height:28px;width:auto;border-radius:5px;" /></td>`
    : "";
  const nameCell = companyName
    ? `<td valign="middle" style="padding:8px 14px 8px ${logo ? "10px" : "14px"};"><span style="color:#221D23;font-size:14px;font-weight:800;letter-spacing:.2px;">${esc(companyName)}</span></td>`
    : "";
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border-radius:11px;">
      <tr>${logoCell}${nameCell}</tr>
    </table>`;
}

/**
 * Top row of a hero card: an eyebrow tag on the left and the company badge
 * (logo + name) on the right, on the same line. Falls back to just the
 * eyebrow, full width, when there's no company badge to show.
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

// ─── Login credentials ──────────────────────────────────────────────────────

type WelcomeStep = { n: number; badgeColor: string; cardColor: string; title: string; copy: string };

const WELCOME_STEPS: WelcomeStep[] = [
  { n: 1, badgeColor: "#FFCE00", cardColor: "#FFF9E8", title: "Create your plan", copy: "Choose what you want to work on." },
  { n: 2, badgeColor: "#F68A29", cardColor: "#FFF4EA", title: "Turn it into actions", copy: "Choose daily or weekly actions." },
  { n: 3, badgeColor: "#3696FC", cardColor: "#EAF5FF", title: "Get reminders", copy: "Get nudged on the schedule you choose." },
  { n: 4, badgeColor: "#23CE68", cardColor: "#E9FFF2", title: "Build team progress", copy: "Completed actions add to your team total." },
];

function welcomeStepCellHtml(step: WelcomeStep, padStyle: string): string {
  return `
    <td class="step-cell" width="50%" valign="top" style="width:50%;${padStyle}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${step.cardColor};border-radius:11px;">
        <tr><td style="padding:12px 13px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="top" style="width:26px;"><div style="width:24px;height:24px;border-radius:12px;background:${step.badgeColor};color:#221D23;text-align:center;font-size:11px;line-height:24px;font-weight:800;">${step.n}</div></td>
            <td style="padding-left:8px;"><div style="font-size:12px;line-height:15px;font-weight:800;color:#221D23;">${esc(step.title)}</div><div style="margin-top:3px;font-size:10px;line-height:14px;color:#6F6871;">${esc(step.copy)}</div></td>
          </tr></table>
        </td></tr>
      </table>
    </td>`;
}

function renderCredentialsHtml(data: EmailTemplateData): string {
  const firstName = str(data, "first_name", "there");
  const loginEmail = str(data, "login_email");
  const password = str(data, "temporary_password");
  const loginUrl = str(data, "login_url", "#");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Your practice starts here</title>
    <style>
      body { margin: 0; padding: 0; background: #F6F2E6; }
      table { border-spacing: 0; }
      td { padding: 0; }
      img { border: 0; display: block; }
      a { color: inherit; }

      @media only screen and (max-width: 620px) {
        .shell { width: 100% !important; }
        .pad { padding-left: 22px !important; padding-right: 22px !important; }
        .hero-title { font-size: 30px !important; line-height: 32px !important; }
        .step-cell { display: block !important; width: 100% !important; padding-right: 0 !important; }
        .step-cell + .step-cell { padding-top: 10px !important; }
        .cta { width: 100% !important; }
      }
    </style>
  </head>
  <body>
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your practice starts here. Sign in to continue your action journey.</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#F6F2E6;">
      <tr>
        <td align="center" style="padding:0 8px 26px;">
          <table role="presentation" class="shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#FFFFFF;border-top:2px solid #FFCE00;border-left:1px solid #E9DFC3;border-right:1px solid #E9DFC3;border-bottom:1px solid #E9DFC3;">

            <tr>
              <td class="pad" style="padding:36px 38px 30px;background:#221D23;color:#FFFFFF;font-family:Inter,Arial,sans-serif;">
                ${heroTopRowHtml(`<div style="display:inline-block;padding:7px 11px;border:1px solid #7E6810;border-radius:20px;color:#FFCE00;font-size:10px;line-height:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;">Welcome</div>`, data)}
                <div class="hero-title" style="margin-top:17px;font-size:36px;line-height:37px;font-weight:800;letter-spacing:-1.4px;">Your practice<br /><span style="color:#FFCE00;">starts here.</span></div>
                <div style="margin-top:17px;color:#E9E5E7;font-size:14px;line-height:21px;">Hey ${esc(firstName)}, your secure access is ready. Use the button below for instant sign in, or keep the credentials for regular login.</div>
              </td>
            </tr>

            <tr>
              <td class="pad" style="padding:26px 38px 0;font-family:Inter,Arial,sans-serif;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#FFFDF8;border:1px solid #E6DDC7;border-radius:14px;overflow:hidden;">
                  <tr>
                    <td style="padding:15px 18px;border-bottom:1px solid #E6DDC7;">
                      <div style="font-size:9px;line-height:12px;font-weight:800;letter-spacing:1.2px;color:#8A818B;text-transform:uppercase;">Login ID</div>
                      <div style="margin-top:5px;font-size:14px;line-height:19px;font-weight:700;color:#1769E0;word-break:break-all;">${esc(loginEmail)}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:15px 18px;">
                      <div style="font-size:9px;line-height:12px;font-weight:800;letter-spacing:1.2px;color:#8A818B;text-transform:uppercase;">Password</div>
                      <div style="margin-top:5px;font-size:14px;line-height:19px;color:#221D23;word-break:break-all;">${esc(password)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="pad" align="center" style="padding:22px 38px 24px;font-family:Inter,Arial,sans-serif;">
                <table role="presentation" class="cta" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" style="background:#221D23;border-radius:11px;">
                      <a href="${esc(loginUrl)}" target="_blank" style="display:block;padding:15px 34px;color:#FFFFFF;text-decoration:none;font-size:13px;line-height:17px;font-weight:800;">Login</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="pad" style="padding:0 38px;font-family:Inter,Arial,sans-serif;">
                <div style="border-top:1px solid #E9E4DC;"></div>
              </td>
            </tr>

            <tr>
              <td class="pad" style="padding:22px 38px 10px;font-family:Inter,Arial,sans-serif;">
                <div style="font-size:18px;line-height:22px;font-weight:800;color:#221D23;">How it works</div>
                <div style="margin-top:4px;color:#77717B;font-size:11px;line-height:16px;">Four simple steps from plan to practice.</div>
              </td>
            </tr>

            <tr>
              <td class="pad" style="padding:0 38px 10px;font-family:Inter,Arial,sans-serif;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    ${welcomeStepCellHtml(WELCOME_STEPS[0], "padding:0 7px 10px 0;")}
                    ${welcomeStepCellHtml(WELCOME_STEPS[1], "padding:0 0 10px 7px;")}
                  </tr>
                  <tr>
                    ${welcomeStepCellHtml(WELCOME_STEPS[2], "padding:0 7px 0 0;")}
                    ${welcomeStepCellHtml(WELCOME_STEPS[3], "padding:0 0 0 7px;")}
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="pad" style="padding:12px 38px 26px;font-family:Inter,Arial,sans-serif;text-align:center;">
                <div style="padding-top:16px;border-top:1px solid #E9E4DC;color:#8A848B;font-size:10px;line-height:15px;">Powered by <a href="https://www.nudgeable.ai" style="color:#623CEA;text-decoration:none;font-weight:700;">Nudgeable.ai</a></div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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

function reminderMetricCellHtml(params: {
  bg: string;
  border: string;
  iconBg: string;
  iconColor: string;
  icon: string;
  value: string;
  label: string;
  padStyle: string;
}): string {
  return `
    <td class="metric-cell" width="33.33%" valign="top" style="width:33.33%;${params.padStyle}">
      <table role="presentation" class="metric-inner" width="100%" cellpadding="0" cellspacing="0" border="0" style="min-height:126px;background:${params.bg};border:1px solid ${params.border};border-radius:13px;">
        <tr><td style="padding:13px 12px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="width:37px;"><div style="width:34px;height:34px;border-radius:17px;background:${params.iconBg};color:${params.iconColor};text-align:center;font-size:16px;line-height:34px;font-weight:900;">${params.icon}</div></td>
            <td style="padding-left:7px;"><div style="font-size:23px;line-height:24px;font-weight:900;color:#221D23;letter-spacing:-.7px;">${params.value}</div></td>
          </tr></table>
          <div style="margin-top:10px;font-size:10px;line-height:13px;font-weight:800;color:#221D23;text-transform:uppercase;letter-spacing:.55px;">${params.label}</div>
        </td></tr>
      </table>
    </td>`;
}

function renderDailyReminderHtml(data: EmailTemplateData): string {
  const firstName = str(data, "first_name", "there");
  const loginUrl = str(data, "login_url", "#");
  const actions = Array.isArray(data.actions) ? (data.actions as ReminderAction[]) : [];
  const count = actions.length;

  const hasFinalisedPlan = data.has_finalised_plan === true;
  const commitmentScore = typeof data.commitment_score === "number" ? data.commitment_score : null;
  const buddyName = typeof data.buddy_name === "string" && data.buddy_name.trim() ? data.buddy_name.trim() : null;
  const buddyScore = typeof data.buddy_score === "number" ? data.buddy_score : null;
  const teamRank = typeof data.team_rank === "number" ? data.team_rank : null;
  const teamSize = typeof data.team_size === "number" ? data.team_size : null;
  const teamPoints = typeof data.team_points === "number" ? data.team_points : 0;
  const teamMaximumPoints = typeof data.team_maximum_points === "number" ? data.team_maximum_points : 0;

  const actionsHtml = actions.length
    ? actions
        .map(
          (action) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFDF8;border:1px solid #E6DDC7;border-radius:13px;margin:0 0 9px;">
      <tr>
        <td width="54" valign="top" style="width:54px;padding:15px 0 15px 13px;"><div style="width:31px;height:31px;border-radius:10px;background:#FFCE00;color:#221D23;text-align:center;font-size:16px;line-height:31px;font-weight:900;">&#8594;</div></td>
        <td valign="top" style="padding:14px 14px 14px 5px;">
          <div style="font-size:13px;line-height:18px;font-weight:650;color:#221D23;">${esc(action.title)}</div>
        </td>
      </tr>
    </table>`
        )
        .join("")
    : `<p style="margin:0;padding:18px;border-radius:13px;background:#FFFDF8;border:1px solid #E6DDC7;color:#5f5860;font-size:13px;line-height:1.5;">Nothing pending right now — nice work staying on top of it.</p>`;

  const nextMilestone = nextMilestoneFor(teamPoints, teamMaximumPoints);
  const milestoneThreshold = nextMilestone ? milestonePoints(teamMaximumPoints, nextMilestone.percent) : 0;
  const milestoneProgress = milestoneThreshold > 0
    ? Math.min(100, Math.max(0, Math.round((teamPoints / milestoneThreshold) * 100)))
    : 0;

  const rewardHtml = teamMaximumPoints === 0
    ? `<div style="color:#CFC9CD;font-size:12px;line-height:1.5;">Waiting for finalised plans before a team reward can be tracked.</div>`
    : !nextMilestone
      ? `<div style="font-size:17px;line-height:21px;font-weight:800;">Every current reward unlocked!</div><div style="margin-top:7px;font-size:9px;line-height:12px;color:#CFC9CD;">Your team reached every milestone so far.</div>`
      : `<div style="font-size:9px;line-height:12px;font-weight:800;color:#FFCE00;letter-spacing:1px;text-transform:uppercase;">Next team reward</div>
         <div style="margin-top:4px;font-size:17px;line-height:21px;font-weight:800;">${esc(nextMilestone.headline)}</div>
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
           <tr><td style="height:7px;background:#474046;border-radius:6px;overflow:hidden;"><div style="width:${milestoneProgress}%;height:7px;background:#23CE68;border-radius:6px;"></div></td></tr>
         </table>
         <div style="margin-top:7px;font-size:9px;line-height:12px;color:#CFC9CD;">Every completed action moves your team closer.</div>`;

  const preheader = "Your next actions are ready.";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Your action reminder</title>
    <style>
      body { margin: 0; padding: 0; background: #F6F2E6; }
      table { border-spacing: 0; }
      td { padding: 0; }
      a { color: inherit; }

      @media only screen and (max-width: 620px) {
        .shell { width: 100% !important; }
        .pad { padding-left: 20px !important; padding-right: 20px !important; }
        .headline { font-size: 29px !important; line-height: 31px !important; }
        .metric-cell { display: block !important; width: 100% !important; padding: 0 0 8px !important; }
        .metric-inner { min-height: 0 !important; }
        .reward-icon-cell { width: 54px !important; }
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
                ${heroTopRowHtml(`<div style="display:inline-block;padding:6px 10px;border:1px solid #756510;border-radius:18px;color:#FFCE00;font-size:9px;line-height:10px;font-weight:800;letter-spacing:1.15px;text-transform:uppercase;">Your action reminder</div>`, data)}
                <div class="headline" style="margin-top:16px;font-size:34px;line-height:36px;font-weight:800;letter-spacing:-1.25px;">Your next actions<br /><span style="color:#FFCE00;">are ready.</span></div>
                <div style="margin-top:12px;color:#E2DEE1;font-size:13px;line-height:19px;">Hey ${esc(firstName)}, your next actions are ready when you are.</div>
              </td>
            </tr>

            <tr>
              <td class="pad" style="padding:22px 34px 4px;font-family:Inter,Arial,sans-serif;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    ${reminderMetricCellHtml({
                      bg: "#FFF8D9", border: "#F0DF9A", iconBg: "#FFCE00", iconColor: "#221D23", icon: "&#10003;",
                      value: hasFinalisedPlan && commitmentScore !== null ? `${Math.round(commitmentScore)}%` : "&mdash;",
                      label: "Your Commitment Score",
                      padStyle: "padding-right:5px;",
                    })}
                    ${reminderMetricCellHtml({
                      bg: "#F1ECFF", border: "#DDD2FF", iconBg: "#F68A29", iconColor: "#221D23", icon: "&#8596;",
                      value: buddyName && buddyScore !== null ? `${Math.round(buddyScore)}%` : "&mdash;",
                      label: buddyName ? `${esc(buddyName)} &middot; Your Buddy` : "No buddy yet",
                      padStyle: "padding-left:3px;padding-right:3px;",
                    })}
                    ${reminderMetricCellHtml({
                      bg: "#EAF5FF", border: "#CDE7FF", iconBg: "#3696FC", iconColor: "#FFFFFF", icon: "&#9733;",
                      value: teamRank !== null && teamSize !== null
                        ? `${teamRank}<span style="font-size:12px;font-weight:700;color:#716A70;letter-spacing:0;"> / ${teamSize}</span>`
                        : "&mdash;",
                      label: "Team Contribution Rank",
                      padStyle: "padding-left:5px;",
                    })}
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="pad" style="padding:22px 34px 9px;font-family:Inter,Arial,sans-serif;">
                <div style="font-size:17px;line-height:21px;font-weight:800;color:#221D23;">Your actions</div>
              </td>
            </tr>

            <tr>
              <td class="pad" style="padding:0 34px 9px;font-family:Inter,Arial,sans-serif;">
                ${actionsHtml}
              </td>
            </tr>

            <tr>
              <td class="pad" style="padding:8px 34px 2px;font-family:Inter,Arial,sans-serif;">
                <div style="padding:11px 13px;background:#FFF8D9;border-radius:11px;color:#4F484D;font-size:11px;line-height:16px;"><strong style="color:#221D23;">Done an action?</strong> Open My Actions and mark it complete in one click to update your Commitment Score and add points to your team.</div>
              </td>
            </tr>

            <tr>
              <td class="pad" align="center" style="padding:14px 34px 24px;font-family:Inter,Arial,sans-serif;">
                <table role="presentation" class="cta" cellpadding="0" cellspacing="0" border="0">
                  <tr><td align="center" style="background:#FFCE00;border:2px solid #221D23;border-radius:10px;box-shadow:3px 3px 0 #221D23;"><a href="${esc(loginUrl)}" target="_blank" style="display:block;padding:13px 34px;color:#221D23;text-decoration:none;font-size:12px;line-height:16px;font-weight:900;letter-spacing:.5px;text-transform:uppercase;">Open My Actions</a></td></tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="pad" style="padding:0 34px 22px;font-family:Inter,Arial,sans-serif;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#221D23;border-radius:15px;">
                  <tr>
                    <td class="reward-icon-cell" width="82" valign="middle" style="width:82px;padding:16px 0 16px 16px;">
                      <div style="width:58px;height:58px;border-radius:15px;background:#FFCE00;color:#221D23;text-align:center;font-size:27px;line-height:58px;">${nextMilestone ? nextMilestone.icon : teamMaximumPoints === 0 ? "⏳" : "🎉"}</div>
                    </td>
                    <td valign="middle" style="padding:16px 18px 16px 12px;color:#FFFFFF;">
                      ${rewardHtml}
                    </td>
                  </tr>
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
      `Hi ${str(data, "first_name", "there")} - Welcome to ${str(data, "company_name", "Nudgeable")}, your access is ready`,
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
      const parts = [str(data, "company_name"), str(data, "batch_name"), str(data, "module_name")].filter(Boolean);
      return `Your actions are ready${parts.length ? ` — ${parts.join(" — ")}` : ""}`;
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
