/**
 * WhatsApp message templates used by the app (Phase 3 of
 * docs/WHATSAPP_REMINDERS_PLAN.md). The template itself lives on the
 * "Nudgeable AI" WhatsApp account and is reviewed by Meta; what's here must
 * match it exactly — same name, language, and placeholder order.
 *
 * action_reminder_company (UTILITY, en):
 *   Header: Your {{1}} actions are ready   ({{1}} = the participant's company)
 *   Body:   Hi {{1}} 👋 Nudgie here! Your planned actions for {{2}}:
 *
 *           {{3}}
 *
 *           Small steps, real change 💪 Open Nudgeable to see how to do each
 *           one, then mark them done ✅ when you finish.
 *   Footer: Reply STOP to turn off WhatsApp reminders
 *   Button: URL "View my actions" →
 *           https://practice.nudgeable.ai/api/auto-login?next=%2Factions&key={{1}}
 *           (the participant's persistent login key, same as reminder emails)
 */

export const ACTION_REMINDER_TEMPLATE = { name: "action_reminder_company", language: "en" } as const;

/** Template parameters can't contain newlines/tabs or 4+ consecutive spaces. */
export function sanitizeTemplateParam(value: string, maxLength: number): string {
  const clean = value.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1).trimEnd()}…` : clean;
}

const MAX_LISTED_ACTIONS = 5;
const MAX_TITLE_LENGTH = 90;

/**
 * "1) Title A · 2) Title B · +2 more" — one line, since the list goes into a
 * single template parameter. Bounded so the body stays well under 1024 chars.
 */
export function formatActionList(titles: string[]): string {
  const listed = titles
    .slice(0, MAX_LISTED_ACTIONS)
    .map((title, index) => `${index + 1}) ${sanitizeTemplateParam(title, MAX_TITLE_LENGTH)}`);
  const remaining = titles.length - listed.length;
  if (remaining > 0) listed.push(`+${remaining} more`);
  return listed.join(" · ");
}

export type TemplateComponent =
  | { type: "header"; parameters: { type: "text"; text: string }[] }
  | { type: "body"; parameters: { type: "text"; text: string }[] }
  | { type: "button"; sub_type: "url"; index: string; parameters: { type: "text"; text: string }[] };

/** Send-time components for action_reminder, in the template's placeholder order. */
export function buildActionReminderComponents(params: {
  /** Shown in the header ("Your Acme actions are ready"); falls back to "Nudgeable". */
  companyName: string | null;
  firstName: string | null;
  track: "daily" | "weekly";
  actionTitles: string[];
  loginKey: string;
}): TemplateComponent[] {
  return [
    {
      type: "header",
      parameters: [{ type: "text", text: sanitizeTemplateParam(params.companyName || "Nudgeable", 30) }],
    },
    {
      type: "body",
      parameters: [
        { type: "text", text: sanitizeTemplateParam(params.firstName || "there", 40) },
        { type: "text", text: params.track === "daily" ? "today" : "this week" },
        { type: "text", text: formatActionList(params.actionTitles) },
      ],
    },
    {
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: params.loginKey }],
    },
  ];
}
