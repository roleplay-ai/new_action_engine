/**
 * WhatsApp message templates used by the app (Phase 3 of
 * docs/WHATSAPP_REMINDERS_PLAN.md). The templates live on the "Nudgeable AI"
 * WhatsApp account and are reviewed by Meta; what's here must match them
 * exactly — same names, language, and placeholder order.
 *
 * Template parameters can't contain line breaks, so each action gets its own
 * line in the template itself. A plan delivers 1–5 actions at a time, so there
 * is one template per count: action_reminder_1 … action_reminder_5 (UTILITY,
 * en). action_reminder_3, for example:
 *
 *   Header: Your {{1}} actions are ready        ({{1}} = company)
 *   Body:   Hi {{1}}, this is your scheduled reminder. These actions from
 *           your plan are due {{2}}:
 *
 *           1) {{3}}
 *           2) {{4}}
 *           3) {{5}}
 *
 *           Open Nudgeable to see how to do each one and mark them done when
 *           you finish.
 *   Footer: Reply STOP to turn off WhatsApp reminders
 *   Button: URL "View my actions" →
 *           https://practice.nudgeable.ai/api/auto-login?next=%2Factions&key={{1}}
 *           (the participant's persistent login key, same as reminder emails)
 *
 * action_reminder_1 is singular and unnumbered ("Your {{1}} action is ready",
 * "This action from your plan is due {{2}}:").
 *
 * Keep the wording strictly factual: these must stay UTILITY. Meta
 * reclassified an earlier draft with motivational/brand lines ("Nudgie here!",
 * "Small steps, real change 💪") as MARKETING — utility content must have no
 * promotional or persuasive intent.
 *
 * More than five actions use action_reminder_5 with "(+N more)" on the last line.
 */

export const ACTION_REMINDER_LANGUAGE = "en";
export const MAX_ACTIONS_PER_TEMPLATE = 5;

export function actionReminderTemplateName(actionCount: number): string {
  const slots = Math.min(Math.max(actionCount, 1), MAX_ACTIONS_PER_TEMPLATE);
  return `action_reminder_${slots}`;
}

/** Template parameters can't contain newlines/tabs or 4+ consecutive spaces. */
export function sanitizeTemplateParam(value: string, maxLength: number): string {
  const clean = value.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1).trimEnd()}…` : clean;
}

const MAX_TITLE_LENGTH = 120;

/**
 * One parameter per action line. Beyond five, the fifth line carries
 * "(+N more)" so nobody thinks the list is complete.
 */
export function actionLines(titles: string[]): string[] {
  const lines = titles
    .slice(0, MAX_ACTIONS_PER_TEMPLATE)
    .map((title) => sanitizeTemplateParam(title, MAX_TITLE_LENGTH));
  const remaining = titles.length - lines.length;
  if (remaining > 0) {
    const last = lines.length - 1;
    lines[last] = `${sanitizeTemplateParam(lines[last], MAX_TITLE_LENGTH - 12)} (+${remaining} more)`;
  }
  return lines;
}

export type TemplateComponent =
  | { type: "header"; parameters: { type: "text"; text: string }[] }
  | { type: "body"; parameters: { type: "text"; text: string }[] }
  | { type: "button"; sub_type: "url"; index: string; parameters: { type: "text"; text: string }[] };

export type TemplateMessage = {
  template: { name: string; language: string };
  components: TemplateComponent[];
};

/**
 * The template and send-time components for one action reminder. Callers
 * pass only the plan's current actions for that batch (same set the reminder
 * email lists); at least one is required.
 */
export function buildActionReminder(params: {
  /** Shown in the header ("Your Acme actions are ready"); falls back to "Nudgeable". */
  companyName: string | null;
  firstName: string | null;
  track: "daily" | "weekly";
  actionTitles: string[];
  loginKey: string;
}): TemplateMessage {
  if (!params.actionTitles.length) throw new Error("An action reminder needs at least one action");
  const lines = actionLines(params.actionTitles);
  return {
    template: { name: actionReminderTemplateName(lines.length), language: ACTION_REMINDER_LANGUAGE },
    components: [
      {
        type: "header",
        parameters: [{ type: "text", text: sanitizeTemplateParam(params.companyName || "Nudgeable", 30) }],
      },
      {
        type: "body",
        parameters: [
          { type: "text", text: sanitizeTemplateParam(params.firstName || "there", 40) },
          { type: "text", text: params.track === "daily" ? "today" : "this week" },
          ...lines.map((text) => ({ type: "text" as const, text })),
        ],
      },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: params.loginKey }],
      },
    ],
  };
}
