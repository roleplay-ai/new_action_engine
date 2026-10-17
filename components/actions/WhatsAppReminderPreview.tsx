"use client";

import { actionLines, sanitizeTemplateParam } from "@/lib/whatsapp-templates";

/**
 * What a participant's WhatsApp reminder looks like. The copy mirrors the
 * Meta-approved plan_reminder_1…3 templates in lib/whatsapp-templates.ts, and
 * the action lines go through the same actionLines() the sender uses.
 */
export default function WhatsAppReminderPreview({
  firstName,
  companyName,
  track,
  actionTitles,
}: {
  firstName: string;
  companyName?: string | null;
  track: "daily" | "weekly";
  actionTitles: string[];
}) {
  const lines = actionLines(actionTitles.length ? actionTitles : ["Your next action"]);
  const many = lines.length > 1;
  const company = sanitizeTemplateParam(companyName || "Nudgeable", 40);
  const due = track === "daily" ? "today" : "this week";

  return (
    <div className="wa-preview" aria-label="Sample WhatsApp reminder">
      <div className="wa-preview-head">
        <span className="wa-preview-avatar" aria-hidden="true">N</span>
        <div><strong>Nudgeable AI</strong><small>Business account</small></div>
      </div>
      <div className="wa-preview-chat">
        <div className="wa-preview-bubble">
          <p>
            Hi {sanitizeTemplateParam(firstName || "there", 40)} 👋, this is your scheduled reminder.{" "}
            {many ? `These actions from your ${company} plan are due ${due}:` : `This action from your ${company} plan is due ${due}:`}
          </p>
          {lines.map((line, index) => <p key={index}>{many ? `${index + 1}) ` : ""}{line}</p>)}
          <p>
            {many
              ? "When you complete an action, click its button below to update its status as done."
              : "When you complete it, click the button below to update its status as done."}
          </p>
          <small className="wa-preview-footer">Reply STOP to turn off WhatsApp reminders</small>
          <time>11:30</time>
        </div>
        <div className="wa-preview-buttons">
          {lines.map((_, index) => <span key={index}>{many ? `Action ${index + 1} done` : "Action done"}</span>)}
        </div>
      </div>
      <p className="actions-reminder-preview-note"><span aria-hidden="true" /> Preview only · no message has been sent.</p>
    </div>
  );
}
