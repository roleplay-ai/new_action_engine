import { describe, expect, it } from "vitest";
import {
  ACTION_REMINDER_TEMPLATE,
  buildActionReminderComponents,
  formatActionList,
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

describe("formatActionList", () => {
  it("numbers actions on one line", () => {
    expect(formatActionList(["Ask an open question", "Share credit"])).toBe(
      "1) Ask an open question · 2) Share credit"
    );
  });

  it("lists at most five and summarises the rest", () => {
    const titles = Array.from({ length: 7 }, (_, i) => `Action ${i + 1}`);
    expect(formatActionList(titles)).toBe(
      "1) Action 1 · 2) Action 2 · 3) Action 3 · 4) Action 4 · 5) Action 5 · +2 more"
    );
  });

  it("keeps a worst-case list within the template's body budget", () => {
    const longTitles = Array.from({ length: 20 }, () => "x".repeat(500));
    expect(formatActionList(longTitles).length).toBeLessThan(600);
  });
});

describe("buildActionReminderComponents", () => {
  it("fills the body placeholders in order and the button with the login key", () => {
    expect(
      buildActionReminderComponents({
        companyName: "Acme Corp",
        firstName: "Asha",
        track: "weekly",
        actionTitles: ["Ask an open question"],
        loginKey: "key-123",
      })
    ).toEqual([
      { type: "header", parameters: [{ type: "text", text: "Acme Corp" }] },
      {
        type: "body",
        parameters: [
          { type: "text", text: "Asha" },
          { type: "text", text: "this week" },
          { type: "text", text: "1) Ask an open question" },
        ],
      },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "key-123" }] },
    ]);
  });

  it("uses 'today' for daily plans and fallbacks for missing names", () => {
    const [header, body] = buildActionReminderComponents({
      companyName: null,
      firstName: null,
      track: "daily",
      actionTitles: ["A"],
      loginKey: "k",
    });
    expect(header.parameters.map((p) => p.text)).toEqual(["Nudgeable"]);
    expect(body.parameters.map((p) => p.text)).toEqual(["there", "today", "1) A"]);
  });

  it("targets the action_reminder_company template", () => {
    expect(ACTION_REMINDER_TEMPLATE).toEqual({ name: "action_reminder_company", language: "en" });
  });
});
