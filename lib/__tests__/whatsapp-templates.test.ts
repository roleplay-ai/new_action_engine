import { describe, expect, it } from "vitest";
import {
  actionLines,
  actionReminderTemplateName,
  buildActionReminder,
  sanitizeTemplateParam,
} from "../whatsapp-templates";

describe("sanitizeTemplateParam", () => {
  it("removes characters WhatsApp rejects in template parameters", () => {
    expect(sanitizeTemplateParam("Line one\nLine\ttwo    spaced", 100)).toBe("Line one Line two spaced");
  });

  it("truncates with an ellipsis", () => {
    expect(sanitizeTemplateParam("abcdefghij", 5)).toBe("abcd…");
    expect(sanitizeTemplateParam("abc", 5)).toBe("abc");
  });
});

describe("actionReminderTemplateName", () => {
  it("picks the template with one line per action, capped at five", () => {
    expect(actionReminderTemplateName(1)).toBe("action_reminder_1");
    expect(actionReminderTemplateName(3)).toBe("action_reminder_3");
    expect(actionReminderTemplateName(5)).toBe("action_reminder_5");
    expect(actionReminderTemplateName(9)).toBe("action_reminder_5");
  });
});

describe("actionLines", () => {
  it("gives one parameter per action", () => {
    expect(actionLines(["Ask an open question", "Share credit"])).toEqual(["Ask an open question", "Share credit"]);
  });

  it("folds extra actions into the fifth line", () => {
    const titles = Array.from({ length: 7 }, (_, i) => `Action ${i + 1}`);
    expect(actionLines(titles)).toEqual(["Action 1", "Action 2", "Action 3", "Action 4", "Action 5 (+2 more)"]);
  });

  it("keeps every line within the length cap", () => {
    const lines = actionLines(Array.from({ length: 8 }, () => "x".repeat(500)));
    expect(lines.every((line) => line.length <= 120)).toBe(true);
  });
});

describe("buildActionReminder", () => {
  it("fills header, body lines and the login button for the matching template", () => {
    expect(
      buildActionReminder({
        companyName: "Acme Corp",
        firstName: "Asha",
        track: "weekly",
        actionTitles: ["Ask an open question", "Share credit"],
        loginKey: "key-123",
      })
    ).toEqual({
      template: { name: "action_reminder_2", language: "en" },
      components: [
        { type: "header", parameters: [{ type: "text", text: "Acme Corp" }] },
        {
          type: "body",
          parameters: [
            { type: "text", text: "Asha" },
            { type: "text", text: "this week" },
            { type: "text", text: "Ask an open question" },
            { type: "text", text: "Share credit" },
          ],
        },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "key-123" }] },
      ],
    });
  });

  it("uses 'today' for daily plans and fallbacks for missing names", () => {
    const { template, components } = buildActionReminder({
      companyName: null,
      firstName: null,
      track: "daily",
      actionTitles: ["A"],
      loginKey: "k",
    });
    expect(template.name).toBe("action_reminder_1");
    expect(components[0].parameters.map((p) => p.text)).toEqual(["Nudgeable"]);
    expect(components[1].parameters.map((p) => p.text)).toEqual(["there", "today", "A"]);
  });

  it("refuses an empty reminder", () => {
    expect(() =>
      buildActionReminder({ companyName: null, firstName: null, track: "weekly", actionTitles: [], loginKey: "k" })
    ).toThrow();
  });
});
