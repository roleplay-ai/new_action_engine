/**
 * WhatsApp message templates used by the app (Phase 3 of
 * docs/WHATSAPP_REMINDERS_PLAN.md). The templates live on the "Nudgeable AI"
 * WhatsApp account and are reviewed by Meta; what's here must match them
 * exactly — same names, language, placeholder order and button order.
 *
 * Template parameters can't contain line breaks, so each action gets its own
 * line in the template itself. A participant has at most three current actions,
 * so there is one template per count: action_done_1 … action_done_3
 * (UTILITY, en) — three buttons, all shown inline. action_done_3:
 *
 *   Header:  Your {{1}} actions are ready        ({{1}} = company)
 *   Body:    Hi {{1}}, this is your scheduled reminder. These actions from
 *            your plan are due {{2}}:
 *
 *            1) {{3}}
 *            2) {{4}}
 *            3) {{5}}
 *
 *            When you finish an action, tap its button below.
 *   Footer:  Reply STOP to turn off WhatsApp reminders
 *   Buttons: QUICK_REPLY "Action 1 done", "Action 2 done", "Action 3 done" —
 *            each payload is set
 *            per message (doneButtonPayload: the tapped number + every action
 *            in the reminder), so a tap completes that action via the webhook
 *            and the follow-up lists the rest (lib/whatsapp-action-completion.ts).
 *            No link to the app: the participant stays in WhatsApp.
 *
 * action_done_1 is singular and unnumbered ("Your {{1}} action is ready",
 * "This action from your plan is due {{2}}:", "When you have done it, tap the
 * button below.", one "Action done" button).
 *
 * Keep the wording strictly factual: these must stay UTILITY. Meta
 * reclassified an earlier draft with motivational/brand lines ("Nudgie here!",
 * "Small steps, real change 💪") as MARKETING — utility content must have no
 * promotional or persuasive intent. (Earlier versions — action_reminder_1…5
 * without buttons, action_checkin_1…3 with "Done N" labels — are no longer
 * used.)
 *
 * Should a reminder ever have more than three actions, it uses
 * action_done_3 with "(+N more)" on the last line, and only the first
 * three get Done buttons.
 */
import { doneButtonPayload } from "@/lib/whatsapp-action-completion";

export const ACTION_REMINDER_LANGUAGE = "en";
export const MAX_ACTIONS_PER_TEMPLATE = 3;

export function actionReminderTemplateName(actionCount: number): string {
  const slots = Math.min(Math.max(actionCount, 1), MAX_ACTIONS_PER_TEMPLATE);
  return `action_done_${slots}`;
}

/** Template parameters can't contain newlines/tabs or 4+ consecutive spaces. */
export function sanitizeTemplateParam(value: string, maxLength: number): string {
  const clean = value.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1).trimEnd()}…` : clean;
}

const MAX_TITLE_LENGTH = 120;

/**
 * One parameter per action line. Beyond three, the third line carries
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
  | { type: "button"; sub_type: "quick_reply"; index: string; parameters: { type: "payload"; payload: string }[] };

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
  actions: { id: string; title: string }[];
}): TemplateMessage {
  if (!params.actions.length) throw new Error("An action reminder needs at least one action");
  const lines = actionLines(params.actions.map((action) => action.title));
  const buttonActionIds = params.actions.slice(0, lines.length).map((action) => action.id);
  const doneButtons = buttonActionIds.map(
    (_actionId, index): TemplateComponent => ({
      type: "button",
      sub_type: "quick_reply",
      index: String(index),
      parameters: [{ type: "payload", payload: doneButtonPayload(buttonActionIds, index + 1) }],
    })
  );
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
      ...doneButtons,
    ],
  };
}
